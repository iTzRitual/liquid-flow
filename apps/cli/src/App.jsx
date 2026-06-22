import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { log as corelog } from '@liquidflow/core';

import { useController } from './useController.js';
import { buildCommands } from './commands.js';
import Banner from './components/Banner.jsx';
import StatusBar from './components/StatusBar.jsx';
import Divider from './components/Divider.jsx';
import LogPane from './components/LogPane.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Picker from './components/Picker.jsx';
import Form from './components/Form.jsx';

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { ctrl, state, mismatches, log, git, shops, refreshShops, clearLog } = useController();

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

  // Wysokość logu dobrana tak, by nagłówek + paleta + input + log mieściły się
  // w terminalu (inaczej Ink dokleja kolejną klatkę = zdublowany layout).
  const reserve = 15 + (filtered.length ? filtered.length + 1 : 0);
  const logRows = Math.max(3, Math.min(16, termRows - reserve));

  return (
    <Box flexDirection="column">
      {/* Logo po lewej, nagłówek (nazwa + status) po prawej */}
      <Box marginTop={1} marginBottom={1}>
        <Box paddingLeft={1}><Banner /></Box>
        <Box marginLeft={3} marginTop={1} flexDirection="column">
          <StatusBar state={state} git={git} />
        </Box>
      </Box>

      {/* Konflikty: pojawiają się tylko gdy istnieją — dolna linia, do prawej, czerwone */}
      {mismatches.length > 0 && (
        <Box justifyContent="flex-end" paddingRight={1}>
          <Text color="red">⚠ Konflikty: {mismatches.length} (/files)</Text>
        </Box>
      )}

      <Divider />

      {mode.type === 'input' && <LogPane log={log} rows={logRows} />}
      {mode.type === 'input' && <Divider />}

      {mode.type === 'picker' && (
        <Picker title={mode.title} items={mode.items} onSelect={mode.onSelect} onSlash={mode.onSlash} onCancel={() => setMode({ type: 'input' })} />
      )}

      {mode.type === 'form' && (
        <Form title={mode.title} fields={mode.fields} onSubmit={mode.onSubmit} onCancel={() => setMode({ type: 'input' })} />
      )}

      {mode.type === 'input' && (
        <>
          {filtered.length > 0 && <CommandPalette items={filtered} index={highlight} />}
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
