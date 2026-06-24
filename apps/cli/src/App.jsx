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
import Form from './components/Form.jsx';

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { ctrl, state, mismatches, log, logVersion, git, shops, progress, refreshShops, clearLog } = useController();

  // mode: { type: 'input' } | { type: 'picker', ... } | { type: 'form', ... }
  const [mode, setMode] = useState({ type: 'input' });
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [termRows, setTermRows] = useState(stdout?.rows || 24);
  const [termCols, setTermCols] = useState(stdout?.columns || 80);
  const [logWrap, setLogWrap] = useState(false); // /wrap: zawijanie logów
  const [logScroll, setLogScroll] = useState(0); // ile wizualnych wierszy od dołu (0 = najnowsze)

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
      ctrl, state, mismatches, git, shops, refreshShops, clearLog, exit, safe,
      logWrap, setLogWrap,
      openPicker: (title, items, onSelect, opts = {}) =>
        setMode({ type: 'picker', title, items, onSlash: opts.onSlash, onSelect: (it, i) => { back(); onSelect?.(it, i); } }),
      openForm: (title, fields, onSubmit) =>
        setMode({ type: 'form', title, fields, onSubmit: (vals) => { back(); onSubmit?.(vals); } }),
      // wyjście z listy startowej do zwykłego inputu z otwartą paletą
      skipToInput: () => { setMode({ type: 'input' }); setQuery('/'); },
      // pokaż ekran ładowania na czas operacji (np. pobierania listy szablonów),
      // a po niej fn otwiera właściwy widok; przy błędzie wróć do inputu
      withLoading: (label, fn) => {
        setMode({ type: 'loading', label });
        Promise.resolve().then(fn).catch((e) => {
          corelog.logErr(e?.message || String(e));
          setMode({ type: 'input' });
          setQuery('');
        });
      },
    };
  }, [ctrl, state, mismatches, git, shops, refreshShops, clearLog, exit, logWrap]);

  const commands = useMemo(() => buildCommands(ctx), [ctx]);

  // Na starcie (gdy niepołączony) od razu otwórz listę sklepów do połączenia.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    if (state && !state.currentShop) {
      booted.current = true;
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
  // paleta: pod nagłówkiem zostaje miejsce na input; log chowamy gdy paleta otwarta
  const paletteMax = Math.max(3, termRows - HEADER - 2);
  // picker: ma ramkę (2) + tytuł (1) + stopkę (1) + zapas (1)
  const pickerMax = Math.max(3, termRows - HEADER - 5);
  // log: wizualne wiersze (zależne od trybu zawijania i szerokości) + zakres scrolla
  const vlines = useMemo(() => buildVlines(log, logWrap, termCols), [log, logWrap, termCols]);
  // +1, bo na górze wskaźnik „↓ nowszych" zabiera wiersz z okna; bez tego
  // najstarsze wpisy (tyle, ile zajmują wskaźniki) byłyby nieosiągalne.
  const maxScroll = vlines.length > logRows ? vlines.length - logRows + 1 : 0;
  const logScrollClamped = Math.min(logScroll, maxScroll);

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
    // dokładne dopasowanie ma pierwszeństwo, w innym wypadku podświetlona pozycja
    const exact = commands.find((c) => c.name === v.split(' ')[0]);
    const target = exact || filtered[highlight];
    if (target) target.run();
  };

  return (
    <Box flexDirection="column" height={fillHeight ? termRows - 1 : undefined}>
      <Header state={state} git={git} mismatches={mismatches} cols={termCols} />

      <Divider />

      {mode.type === 'loading' && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text color="cyan" bold>Wybierz szablon</Text>
          <Box><Spinner color="cyan" /><Text> {mode.label || 'Ładowanie…'}</Text></Box>
        </Box>
      )}

      {mode.type === 'picker' && (
        <Picker title={mode.title} items={mode.items} onSelect={mode.onSelect} onSlash={mode.onSlash} onCancel={() => setMode({ type: 'input' })} maxRows={pickerMax} />
      )}

      {mode.type === 'form' && (
        <Form title={mode.title} fields={mode.fields} onSubmit={mode.onSubmit} onCancel={() => setMode({ type: 'input' })} />
      )}

      {mode.type === 'input' && (
        <>
          {/* Środek rośnie i wypycha input na sam dół; log/postęp/paleta hugują
              dół (tuż nad inputem). Input stoi stabilnie na dole, a log rośnie w
              górę, wypełniając wysokość. Gdy paleta otwarta — chowamy log. */}
          <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
            {paletteOpen
              ? <CommandPalette items={filtered} index={highlight} maxRows={paletteMax} />
              : (
                <>
                  {log.length > 0 && <LogPane vlines={vlines} rows={logRows} scroll={logScrollClamped} />}
                  {progress && <ProgressView progress={progress} />}
                </>
              )}
          </Box>
          {!paletteOpen && (log.length > 0 || progress) && <Divider />}
          <Box paddingLeft={1}>
            <Text color="#ff5a1f">› </Text>
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={onSubmit}
              placeholder="wpisz / aby zobaczyć komendy · /exit wyjście"
            />
          </Box>
        </>
      )}
    </Box>
  );
}
