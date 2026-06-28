import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { log as corelog, tfmt } from '@liquidflow/core';

import { useController } from './useController.js';
import { buildCommands } from './commands.js';
import { headerLayout, naturalBodyRows } from './layout.js';
import Header from './components/Header.jsx';
import Divider from './components/Divider.jsx';
import ProgressView from './components/ProgressView.jsx';
import Spinner from './components/Spinner.jsx';
import LogPane, { buildVlines } from './components/LogPane.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Picker from './components/Picker.jsx';
import ConflictList from './components/ConflictList.jsx';
import ConnectList from './components/ConnectList.jsx';
import Form from './components/Form.jsx';
import DiffView from './components/DiffView.jsx';

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { ctrl, t, state, mismatches, log, logVersion, git, shops, progress, refreshShops, clearLog } = useController();

  // mode: { type: 'input' } | { type: 'picker', ... } | { type: 'form', ... }
  const [mode, setMode] = useState({ type: 'input' });
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [termRows, setTermRows] = useState(stdout?.rows || 24);
  const [termCols, setTermCols] = useState(stdout?.columns || 80);
  // Preferencje UI (zawijanie logów, tryb nagłówka) żyją w configu rdzenia — czytamy
  // je ze `state` (pamiętane między uruchomieniami), a zapis idzie przez `ctrl`
  // (emituje 'state' → odświeżenie). Settery zachowują dawną sygnaturę dla komend.
  const logWrap = !!state?.logWrap;
  const setLogWrap = (v) => ctrl.setUiPref('logWrap', v);
  const headerPref = state?.headerMode || 'auto';
  const setHeaderPref = (v) => ctrl.setUiPref('headerMode', v);
  const [logScroll, setLogScroll] = useState(0); // ile wizualnych wierszy od dołu (0 = najnowsze)
  // Nawigacja „wstecz”: każda otwierana nakładka dostaje wskaźnik `parent` (ekran,
  // z którego przyszliśmy). Esc wraca do rodzica, a dopiero z ekranu najwyższego
  // poziomu — do inputu. `pendingParentRef` przenosi rodzica przez asynchroniczne
  // otwarcia (loader → ekran): ustawiamy go w momencie interakcji użytkownika
  // (wybór w pickerze/formularzu, akcja w connect/conflicts), a konsumuje go
  // helper otwierający kolejną nakładkę. Czyszczony przy starcie komendy (skok od
  // inputu nie ma rodzica) i przy cofaniu.
  const pendingParentRef = useRef(null);
  const takeParent = () => { const p = pendingParentRef.current; pendingParentRef.current = null; return p || null; };
  // Cofnięcie z nakładki: pokaż rodzica (jeśli jest), inaczej wróć do inputu.
  const cancelTo = (m) => {
    pendingParentRef.current = null;
    const p = m?.parent;
    if (p) setMode(p);
    else { setMode({ type: 'input' }); setQuery(''); }
  };

  // Reaguj na zmianę rozmiaru terminala. Ink przy resize tylko przelicza layout
  // istniejącego drzewa (nie wywołuje ponownie komponentów) i nie czyści ekranu —
  // dlatego: (1) czyścimy cały ekran, by terminal nie zostawił zawiniętych, za
  // szerokich wierszy z poprzedniego rozmiaru, (2) aktualizujemy stan (rows+cols),
  // co wymusza pełny re-render wszystkich komponentów zależnych od szerokości
  // (Divider liczy '─'×cols, Header przełącza kolumny↔wiersze).
  useEffect(() => {
    if (!stdout) return undefined;
    const onResize = () => {
      try { stdout.write('\x1b[2J\x1b[3J\x1b[H'); } catch {}
      setTermRows(stdout.rows || 24);
      setTermCols(stdout.columns || 80);
    };
    stdout.on('resize', onResize);
    return () => stdout.off('resize', onResize);
  }, [stdout]);

  // Pomocnicy przekazywani do komend — otwieranie nakładek i bezpieczne akcje.
  const ctx = useMemo(() => {
    const back = () => { setMode({ type: 'input' }); setQuery(''); };
    const safe = (fn) => Promise.resolve().then(fn).catch((e) => corelog.logErr(e?.message || String(e)));
    return {
      ctrl, t, state, mismatches, git, shops, refreshShops, clearLog, exit, safe,
      logWrap, setLogWrap,
      headerPref, setHeaderPref,
      // Wybór pozycji zamyka picker (back → input), a wskaźnik rodzica zapisujemy
      // tuż przed handlerem — jeśli ten otworzy kolejną nakładkę, dostanie ona ten
      // picker jako rodzica (Esc wróci tu, a nie do inputu).
      openPicker: (title, items, onSelect, opts = {}) => {
        const self = { type: 'picker', title, items, onSlash: opts.onSlash, parent: takeParent() };
        self.onSelect = (it, i) => { pendingParentRef.current = self; back(); onSelect?.(it, i); };
        setMode(self);
      },
      openForm: (title, fields, onSubmit) => {
        const self = { type: 'form', title, fields, parent: takeParent() };
        self.onSubmit = (vals) => { pendingParentRef.current = self; back(); onSubmit?.(vals); };
        setMode(self);
      },
      // ekran konfliktów (karty + stopka seryjna). Handlery same sterują trybem
      // (loader/odświeżenie/potwierdzenie), więc nie owijamy ich w back(). Ekran
      // jest zawsze wchodzony z poziomu inputu (/conflicts lub wskaźnik), więc
      // rodzic = input; jego akcje (potwierdzenia) dostają ten ekran jako rodzica.
      openConflicts: (data) => {
        pendingParentRef.current = null;
        const self = { type: 'conflicts', ...data, parent: null };
        self.onAction = (...a) => { pendingParentRef.current = self; data.onAction?.(...a); };
        self.onBulk = (...a) => { pendingParentRef.current = self; data.onBulk?.(...a); };
        setMode(self);
      },
      // ekran łączenia (lista sklepów + stopka akcji). Handlery same sterują
      // trybem (loader/formularz/sub-picker), więc nie owijamy ich w back().
      // Akcje (Dodaj/Usuń/wybór sklepu) zapisują ten ekran jako rodzica, by Esc
      // z formularza/sub-pickera wrócił do listy sklepów, a nie do inputu.
      openConnect: (data) => {
        const self = { type: 'connect', ...data, parent: takeParent() };
        self.onShop = (...a) => { pendingParentRef.current = self; data.onShop?.(...a); };
        self.onAction = (...a) => { pendingParentRef.current = self; data.onAction?.(...a); };
        setMode(self);
      },
      // ekran podglądu diff (read-only). Esc wraca do rodzica (ekranu konfliktów).
      openDiff: (data) => {
        const self = { type: 'diff', ...data, parent: takeParent() };
        setMode(self);
      },
      // porzuć zapamiętanego rodzica — gdy ekran, z którego przyszliśmy, przestaje
      // być aktualny (np. po `init` ekran „brak repo” znika), kolejny otwarty
      // widok ma wrócić Esc do inputu, a nie do nieaktualnego ekranu.
      dropParent: () => { pendingParentRef.current = null; },
      // wyjście z listy startowej do zwykłego inputu z otwartą paletą
      skipToInput: () => { setMode({ type: 'input' }); setQuery('/'); },
      // powrót do czystego inputu (np. gdy operacja z loaderem nie otwiera widoku)
      backToInput: back,
      // pokaż ekran ładowania na czas operacji (np. pobierania listy szablonów),
      // a po niej fn otwiera właściwy widok; przy błędzie wróć do inputu.
      // `title` (opcjonalny) nadpisuje domyślny nagłówek loadera. Użycie loadera
      // zamiast „gołego” inputu eliminuje też mignięcie ekranu głównego, gdy fn
      // jest asynchroniczne (back()→input zdąża się wyrenderować przed otwarciem
      // właściwego widoku) — spinner trzyma kadr do czasu otwarcia widoku.
      withLoading: (label, fn, title) => {
        setMode({ type: 'loading', label, title });
        Promise.resolve().then(fn).catch((e) => {
          corelog.logErr(e?.message || String(e));
          setMode({ type: 'input' });
          setQuery('');
        });
      },
    };
  }, [ctrl, t, state, mismatches, git, shops, refreshShops, clearLog, exit, logWrap, headerPref]);

  const commands = useMemo(() => buildCommands(ctx), [ctx]);

  // Na starcie (gdy niepołączony) od razu otwórz listę sklepów do połączenia.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    if (state && !state.currentShop) {
      booted.current = true;
      pendingParentRef.current = null;
      commands.find((c) => c.name === '/connect')?.run();
    }
  }, [state, commands]);

  // Filtrowanie palety na podstawie wpisanego tekstu (po wiodącym '/').
  const palette = query.startsWith('/') ? query.slice(1).toLowerCase() : null;
  const filtered = useMemo(() => {
    if (palette === null) return [];
    return commands.filter((c) => c.name.slice(1).toLowerCase().includes(palette));
  }, [commands, palette]);

  useEffect(() => { setHighlight(0); }, [query]);
  // Po przełączeniu kanału logu (zmiana sklepu/szablonu) zjedź na dół, by
  // pokazać najnowszy strumień (a nie zachować scroll z poprzedniego kanału).
  useEffect(() => { setLogScroll(0); }, [logVersion]);

  // --- wymiary i pochodne (przed useInput, bo scroll ich używa) ---
  const paletteOpen = filtered.length > 0;
  // Nagłówek degraduje się z wysokością okna: pełny → compact (1 wiersz) →
  // ukryty (nakładka „nachodzi" na nagłówek), a gdy nawet bez nagłówka nie ma
  // miejsca na minimum trybu → guard (ekran „okno za małe"). Liczone w layout.js.
  const hl = headerLayout({ termRows, termCols, mode, pref: headerPref });
  const headerMode = hl.mode; // 'full' | 'compact' | 'none' | 'guard'
  const tooSmall = headerMode === 'guard';
  // Realna wysokość nagłówka (z górnym dividerem). 0 gdy ukryty/guard.
  const HEADER = hl.height;
  // Log wypełnia dostępną wysokość. Pasek postępu, gdy widoczny, zajmuje 1 wiersz.
  const progressRows = progress ? 1 : 0;
  const logRows = Math.max(1, termRows - HEADER - progressRows - 2);
  // paleta (gdy log się nie mieści obok): pełna wysokość pod nagłówkiem
  const paletteMax = Math.max(3, termRows - HEADER - 1);
  // log: wizualne wiersze (zależne od trybu zawijania i szerokości) + zakres scrolla
  const vlines = useMemo(() => buildVlines(log, logWrap, termCols), [log, logWrap, termCols]);
  // +1, bo na górze wskaźnik „↓ nowszych" zabiera wiersz z okna; bez tego
  // najstarsze wpisy (tyle, ile zajmują wskaźniki) byłyby nieosiągalne.
  const maxScroll = vlines.length > logRows ? vlines.length - logRows + 1 : 0;
  const logScrollClamped = Math.min(logScroll, maxScroll);

  // --- nakładki (picker/form/conflicts/connect/loading) ---
  // Spójna zasada: ekran przyklejony do DOŁU (jak input), a nad nim — log jako
  // kontekst (filler). Wysokość ekranu liczymy z DANYCH (ile pozycji), więc krótki
  // ekran nie zabiera całej wysokości — log dostaje resztę; długi ekran windowuje
  // się, a log znika (1 linia logu NIE jest wymogiem — to tylko wypełnienie).
  //
  // `overlayAvail` MUSI równać się REALNEJ wysokości flex‑boxa nakładki, inaczej
  // `justifyContent:flex-end` spycha za krótki stos w dół i zostaje pusty wiersz
  // (gap). Ten flex‑box jest jedynym (rosnącym) dzieckiem roota po nagłówku, więc:
  //   root(termRows) − HEADER = termRows − HEADER.
  const overlayAvail = Math.max(1, termRows - HEADER);
  // Naturalna (pełna) wysokość nakładki — TA SAMA liczba, którą layout.js bierze do
  // degradacji nagłówka, więc próg „nakładka się okienkuje" == próg „nagłówek
  // ustępuje" (jedno źródło prawdy w layout.js → header zmniejsza się dokładnie
  // wtedy, gdy inaczej musielibyśmy okienkować treść).
  const overlayNatural = naturalBodyRows(mode);
  const ovRows = Math.min(overlayNatural, overlayAvail);
  const ovMax = Math.max(1, ovRows - 4); // body ekranu (chrome ekranu = 4 wiersze)
  // log nad ekranem (bez wiersza przerwy — ekran lgnie wprost pod log); pokazujemy
  // tylko gdy zostają ≥2 wiersze — 1‑wierszowy log to sam wskaźnik „↑ więcej" (bez
  // treści), a log jest tu tylko wypełniaczem, więc go wtedy pomijamy (ekran
  // zajmuje całą wysokość).
  const ovLogRows = Math.max(0, overlayAvail - ovRows);
  const ovShowLog = ovLogRows >= 2 && log.length > 0;

  // --- paleta w trybie input ---
  // Slash NIE chowa logu: paleta zajmuje kawałek przy dole (tuż nad inputem),
  // a log wypełnia resztę nad nią. Mieścimy się tylko gdy jest sensownie wysoko.
  const showLogWithPalette = log.length > 0 && logRows >= 10;
  const logWithPalette = paletteOpen && showLogWithPalette;
  // Aktywny tryb: log > divider > podpowiedzi > input (ten sam divider co pasywny,
  // tuż pod logiem; bez spacera). Divider(1)+input(1) już są w budżecie logRows (−3);
  // paleta to dodatkowy sibling, więc log oddaje jej tyle wierszy ile zajmie.
  // −4 zostawia ≥3 wiersze logu nad dividerem.
  const paletteCap = Math.max(3, Math.min(filtered.length, logRows - 4));
  const paletteLogRows = Math.max(1, logRows - paletteCap);

  // Klawiatura/scroll w trybie input. Paleta otwarta → nawigacja palety; paleta
  // zamknięta → strzałki/kółko (alt‑scroll) przewijają log na ekranie głównym.
  useInput((input, key) => {
    if (paletteOpen) {
      if (key.upArrow) { setHighlight((h) => (h - 1 + filtered.length) % filtered.length); return; }
      if (key.downArrow) { setHighlight((h) => (h + 1) % filtered.length); return; }
      if (key.tab) { setQuery(filtered[highlight].name + ' '); return; }
      return;
    }
    if (key.upArrow) { setLogScroll((s) => Math.min(maxScroll, s + 1)); return; }
    if (key.downArrow) { setLogScroll((s) => Math.max(0, s - 1)); return; }
    if (key.pageUp) { setLogScroll((s) => Math.min(maxScroll, s + logRows)); return; }
    if (key.pageDown) { setLogScroll((s) => Math.max(0, s - logRows)); return; }
  }, { isActive: mode.type === 'input' });

  const onSubmit = (value) => {
    const v = (value || '').trim();
    setQuery('');
    setLogScroll(0); // po komendzie wróć na dół, by zobaczyć świeży wynik
    if (!v.startsWith('/')) return;
    pendingParentRef.current = null; // komenda startuje od inputu — brak rodzica
    // dokładne dopasowanie ma pierwszeństwo, w innym wypadku podświetlona pozycja
    const exact = commands.find((c) => c.name === v.split(' ')[0]);
    const target = exact || filtered[highlight];
    if (target) target.run();
  };

  // Owija ekran nakładki we wspólny obszar akcji: log u góry (kontekst, filler),
  // ekran przyklejony do dołu — spójnie z inputem. To FUNKCJA (nie komponent),
  // żeby Box miał stabilną tożsamość w drzewie i nie remontował ekranu (zachowanie
  // stanu useState pickerów). Log to wypełniacz — gdy brak miejsca (niskie okno),
  // `ovShowLog` jest false i ekran zajmuje całą wysokość (nakładka „nachodzi" na
  // miejsce po ukrytym nagłówku). Brak wiersza przerwy między logiem a ramką —
  // ekran lgnie wprost pod (wyszarzony) log, jak input pod divider.
  const wrapAction = (node) => {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
        {ovShowLog && <LogPane vlines={vlines} rows={ovLogRows} scroll={0} t={t} dim />}
        {node}
      </Box>
    );
  };

  // Okno za niskie, by zmieścić bieżący tryb nawet bez nagłówka — pokaż prośbę o
  // powiększenie zamiast rozsypanego/zdublowanego widoku (Ink przy przepełnieniu
  // dokleja kopię ramki). Komunikat mieści się w 1 wierszu (truncate-end).
  if (tooSmall) {
    return (
      <Box height={termRows} alignItems="center" justifyContent="center" paddingX={1}>
        <Text color="yellow" wrap="truncate-end">{tfmt(t.WindowTooSmall, { rows: hl.minRows })}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termRows}>
      {headerMode !== 'none' && (
        <Header state={state} git={git} mismatches={mismatches} cols={termCols} t={t} compact={headerMode === 'compact'} />
      )}

      {headerMode !== 'none' && <Divider />}

      {mode.type === 'loading' && wrapAction(
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text color="cyan" bold>{mode.title || t.SelectTemplate}</Text>
          <Box><Spinner color="cyan" /><Text> {mode.label || t.Loading}</Text></Box>
        </Box>
      )}

      {mode.type === 'picker' && wrapAction(
        <Picker title={mode.title} items={mode.items} onSelect={mode.onSelect} onSlash={mode.onSlash} onCancel={() => cancelTo(mode)} maxRows={ovMax} t={t} />
      )}

      {mode.type === 'form' && wrapAction(
        <Form title={mode.title} fields={mode.fields} onSubmit={mode.onSubmit} onCancel={() => cancelTo(mode)} t={t} />
      )}

      {mode.type === 'conflicts' && wrapAction(
        <ConflictList title={mode.title} files={mode.files} bulk={mode.bulk} onAction={mode.onAction} onBulk={mode.onBulk} onCancel={() => cancelTo(mode)} maxRows={ovMax} t={t} />
      )}

      {mode.type === 'connect' && wrapAction(
        <ConnectList title={mode.title} shops={mode.shops} actions={mode.actions} onShop={mode.onShop} onAction={mode.onAction} onSlash={mode.onSlash} onCancel={() => cancelTo(mode)} maxRows={ovMax} t={t} />
      )}

      {mode.type === 'diff' && wrapAction(
        <DiffView title={mode.title} preview={mode.preview} onCancel={() => cancelTo(mode)} maxRows={ovMax} t={t} />
      )}

      {mode.type === 'input' && (
        <>
          {/* Środek rośnie i wypycha strefę akcji na dół. Log wypełnia górę, pod
              nim divider, a poniżej (gdy paleta otwarta) podpowiedzi tuż nad
              inputem: log > divider > podpowiedzi > input. Slash nie chowa logu. */}
          <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
            {paletteOpen
              ? (logWithPalette
                  ? <LogPane vlines={vlines} rows={paletteLogRows} scroll={0} t={t} dim />
                  : null)
              : (
                <>
                  {log.length > 0 && <LogPane vlines={vlines} rows={logRows} scroll={logScrollClamped} t={t} />}
                  {progress && <ProgressView progress={progress} />}
                </>
              )}
          </Box>
          {(paletteOpen ? logWithPalette : (log.length > 0 || progress)) && <Divider />}
          {paletteOpen && (
            <CommandPalette items={filtered} index={highlight} maxRows={logWithPalette ? paletteCap : paletteMax} t={t} />
          )}
          <Box paddingLeft={1}>
            <Text color="#ff5a1f">› </Text>
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={onSubmit}
              placeholder={t.InputPlaceholder}
            />
          </Box>
        </>
      )}
    </Box>
  );
}
