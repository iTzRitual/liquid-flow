import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { log as corelog } from '@liquidflow/core';

import { useController } from './useController.js';
import { buildCommands } from './commands.js';
import Banner from './components/Banner.jsx';
import StatusBar from './components/StatusBar.jsx';
import Divider from './components/Divider.jsx';
import ProgressView from './components/ProgressView.jsx';
import Spinner from './components/Spinner.jsx';
import LogPane from './components/LogPane.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Picker from './components/Picker.jsx';
import Form from './components/Form.jsx';

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { ctrl, state, mismatches, log, git, shops, progress, refreshShops, clearLog } = useController();

  // mode: { type: 'input' } | { type: 'picker', ... } | { type: 'form', ... }
  const [mode, setMode] = useState({ type: 'input' });
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [termRows, setTermRows] = useState(stdout?.rows || 24);

  // Reaguj na zmianę rozmiaru terminala, by żywa ramka zawsze mieściła się na ekranie.
  useEffect(() => {
    if (!stdout) return undefined;
    const onResize = () => setTermRows(stdout.rows || 24);
    stdout.on('resize', onResize);
    return () => stdout.off('resize', onResize);
  }, [stdout]);

  // Pomocnicy przekazywani do komend — otwieranie nakładek i bezpieczne akcje.
  const ctx = useMemo(() => {
    const back = () => { setMode({ type: 'input' }); setQuery(''); };
    const safe = (fn) => Promise.resolve().then(fn).catch((e) => corelog.logErr(e?.message || String(e)));
    return {
      ctrl, state, mismatches, git, shops, refreshShops, clearLog, exit, safe,
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
  }, [ctrl, state, mismatches, git, shops, refreshShops, clearLog, exit]);

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

  // Nawigacja palety (tylko w trybie input). Strzałki + Tab; Enter obsługuje TextInput.
  useInput((input, key) => {
    if (filtered.length) {
      if (key.upArrow) { setHighlight((h) => (h - 1 + filtered.length) % filtered.length); return; }
      if (key.downArrow) { setHighlight((h) => (h + 1) % filtered.length); return; }
      if (key.tab) { setQuery(filtered[highlight].name + ' '); return; }
    }
  }, { isActive: mode.type === 'input' });

  const onSubmit = (value) => {
    const v = (value || '').trim();
    setQuery('');
    if (!v.startsWith('/')) return;
    // dokładne dopasowanie ma pierwszeństwo, w innym wypadku podświetlona pozycja
    const exact = commands.find((c) => c.name === v.split(' ')[0]);
    const target = exact || filtered[highlight];
    if (target) target.run();
  };

  // Wysokości dynamiczne, by całość zawsze mieściła się w oknie (inaczej Ink
  // dokleja kolejną klatkę = zdublowany layout). Stałe „chrome" = nagłówek
  // (logo+marginesy) + dividery + input + zapas.
  const paletteOpen = filtered.length > 0;
  const HEADER = 9;             // logo (6) + marginTop/Bottom (2) + divider (1)
  const logRows = Math.max(3, Math.min(16, termRows - HEADER - 6));
  // paleta: pod nagłówkiem zostaje miejsce na input; log chowamy gdy paleta otwarta
  const paletteMax = Math.max(3, termRows - HEADER - 2);
  // picker: ma ramkę (2) + tytuł (1) + stopkę (1) + zapas (1)
  const pickerMax = Math.max(3, termRows - HEADER - 5);

  return (
    <Box flexDirection="column">
      {/* Logo po lewej, nagłówek (nazwa + status) po prawej */}
      <Box marginTop={1} marginBottom={1}>
        <Box paddingLeft={1}><Banner /></Box>
        {/* Kolumna rozciąga się do wysokości logo; status u góry, konflikty
            przypięte do dołu (puste pole) — pojawienie się nie spycha układu. */}
        <Box marginLeft={3} marginTop={1} marginBottom={1} flexDirection="column" justifyContent="space-between">
          <StatusBar state={state} git={git} />
          {mismatches.length > 0 && (
            <Text color="red">⚠ Konflikty: {mismatches.length} (/conflicts)</Text>
          )}
        </Box>
      </Box>

      <Divider />

      {/* Log/progress chowamy gdy otwarta paleta — by lista + input zmieściły się */}
      {mode.type === 'input' && !paletteOpen && log.length > 0 && <LogPane log={log} rows={logRows} />}
      {mode.type === 'input' && !paletteOpen && progress && <ProgressView progress={progress} />}
      {mode.type === 'input' && !paletteOpen && (log.length > 0 || progress) && <Divider />}

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
          {paletteOpen && <CommandPalette items={filtered} index={highlight} maxRows={paletteMax} />}
          <Box paddingLeft={1}>
            <Text color="#ff5a1f">› </Text>
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={onSubmit}
              placeholder="wpisz / aby zobaczyć komendy · Ctrl+C wyjście"
            />
          </Box>
        </>
      )}
    </Box>
  );
}
