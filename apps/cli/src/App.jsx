import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { log as corelog } from '@liquidflow/core';

import { useController } from './useController.js';
import { buildCommands } from './commands.js';
import Header, { HEADER_STACK_COLS } from './components/Header.jsx';
import Divider from './components/Divider.jsx';
import ProgressView from './components/ProgressView.jsx';
import Spinner from './components/Spinner.jsx';
import LogPane, { buildVlines } from './components/LogPane.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Picker from './components/Picker.jsx';
import ConflictList from './components/ConflictList.jsx';
import ConnectList from './components/ConnectList.jsx';
import Form from './components/Form.jsx';

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
  const [logWrap, setLogWrap] = useState(false); // /wrap: zawijanie logów
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
  }, [ctrl, t, state, mismatches, git, shops, refreshShops, clearLog, exit, logWrap]);

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
  // Stałe „chrome" = nagłówek (logo+marginesy) + dividery + input + zapas.
  const paletteOpen = filtered.length > 0;
  // Wysokość „chrome" nagłówka. W układzie pionowym (wąskie okno) logo i
  // informacje są pod sobą, więc nagłówek jest wyższy.
  const stackedHeader = termCols < HEADER_STACK_COLS;
  // Realna wysokość nagłówka: marginTop(1)+logo(6)=7, plus górny divider=8 (logo
  // zawsze dominuje nad kolumną informacji). Dokładna wartość sprawia, że log
  // przylega do górnego dividera (brak pustej linii). Stackowany jest wyższy.
  const HEADER = stackedHeader ? 14 : 8;
  // Log wypełnia całą dostępną wysokość (bez sztywnego limitu 16). Pasek postępu,
  // gdy widoczny, zajmuje 1 wiersz — odejmujemy go z budżetu.
  const progressRows = progress ? 1 : 0;
  const logRows = Math.max(3, termRows - HEADER - progressRows - 3);
  // Na sensownie wysokim oknie przypinamy input do dołu (flexGrow w obszarze
  // logu); na niskim wracamy do naturalnego przepływu, by nic nie wystawało.
  const fillHeight = termRows >= 16;
  // paleta (gdy log się nie mieści obok): pełna wysokość pod nagłówkiem
  const paletteMax = Math.max(3, termRows - HEADER - 2);
  // log: wizualne wiersze (zależne od trybu zawijania i szerokości) + zakres scrolla
  const vlines = useMemo(() => buildVlines(log, logWrap, termCols), [log, logWrap, termCols]);
  // +1, bo na górze wskaźnik „↓ nowszych" zabiera wiersz z okna; bez tego
  // najstarsze wpisy (tyle, ile zajmują wskaźniki) byłyby nieosiągalne.
  const maxScroll = vlines.length > logRows ? vlines.length - logRows + 1 : 0;
  const logScrollClamped = Math.min(logScroll, maxScroll);

  // --- nakładki (picker/form/conflicts/connect/loading) ---
  // Spójna zasada: ekran przyklejony do DOŁU (jak input), a nad nim — log jako
  // kontekst. Obszar treści pod górnym dividerem: root(termRows-1) − header − div.
  // Wysokość ekranu liczymy z DANYCH (ile pozycji), więc krótki ekran nie zabiera
  // całej wysokości — log dostaje resztę; długi ekran windowuje się, log dostaje
  // minimum. Niezmiennik: logRows + wysokość_ekranu ≤ overlayAvail (anty‑overflow).
  const overlayAvail = Math.max(3, termRows - HEADER - 2);
  const overlayNatural =
    mode.type === 'picker' ? (mode.items?.length || 0) + 4
    : mode.type === 'connect' ? (mode.shops?.length || 0) + 6
    : mode.type === 'conflicts' ? (mode.files?.length || 0) * 3 + (mode.bulk?.length ? 2 : 0) + 4
    : mode.type === 'form' ? (mode.fields?.length || 0) + 4
    : 4; // loading
  const ovShowLog = fillHeight && log.length > 0 && overlayAvail >= 12;
  const ovReserve = ovShowLog ? 4 : 0; // minimalny log nad ekranem
  const ovRows = Math.min(overlayNatural, overlayAvail - ovReserve);
  const ovMax = Math.max(3, ovRows - 4); // body ekranu (chrome ekranu = 4 wiersze)
  // log nad ekranem + 1 wiersz przerwy (spacer) między logiem a ekranem
  const ovLogRows = ovShowLog ? Math.max(0, overlayAvail - ovRows - 1) : 0;

  // --- paleta w trybie input ---
  // Slash NIE chowa już logu: paleta zajmuje kawałek przy dole (tuż nad inputem),
  // a log wypełnia resztę nad nią. Mieścimy się tylko gdy jest sensownie wysoko.
  const showLogWithPalette = fillHeight && log.length > 0 && logRows >= 10;
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

  // Owija ekran nakładki we wspólny obszar akcji: log u góry (kontekst), ekran
  // przyklejony do dołu — spójnie z inputem. To FUNKCJA (nie komponent), żeby Box
  // miał stabilną tożsamość w drzewie i nie remontował ekranu (zachowanie stanu
  // useState pickerów). Na niskim oknie (brak fillHeight) — naturalny przepływ.
  const wrapAction = (node) => {
    if (!fillHeight) return node;
    const showLog = ovLogRows > 0 && log.length > 0;
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
        {showLog && <LogPane vlines={vlines} rows={ovLogRows} scroll={0} t={t} dim />}
        {showLog && <Text> </Text>}
        {node}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" height={fillHeight ? termRows - 1 : undefined}>
      <Header state={state} git={git} mismatches={mismatches} cols={termCols} t={t} />

      <Divider />

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
