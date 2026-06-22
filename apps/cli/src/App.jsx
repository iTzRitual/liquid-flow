import { Box, Text, Static, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import React, { useEffect, useMemo, useState } from 'react';
import { log as corelog } from '@liquidflow/core';

import { useController } from './useController.js';
import { buildCommands } from './commands.js';
import Banner from './components/Banner.jsx';
import StatusBar from './components/StatusBar.jsx';
import LogPane from './components/LogPane.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Picker from './components/Picker.jsx';
import Form from './components/Form.jsx';

// Banner drukowany jednorazowo przez <Static> — nie wchodzi do żywej ramki,
// więc nie powiększa obszaru, który Ink przerysowuje przy każdej zmianie.
const BANNER_ITEMS = ['banner'];

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

  const version = useMemo(() => ctrl.getTranslations().Version, [ctrl]);

  // Pomocnicy przekazywani do komend — otwieranie nakładek i bezpieczne akcje.
  const ctx = useMemo(() => {
    const back = () => { setMode({ type: 'input' }); setQuery(''); };
    const safe = (fn) => Promise.resolve().then(fn).catch((e) => corelog.logErr(e?.message || String(e)));
    return {
      ctrl, state, mismatches, git, shops, refreshShops, clearLog, exit, safe,
      openPicker: (title, items, onSelect) =>
        setMode({ type: 'picker', title, items, onSelect: (it, i) => { back(); onSelect?.(it, i); } }),
      openForm: (title, fields, onSubmit) =>
        setMode({ type: 'form', title, fields, onSubmit: (vals) => { back(); onSubmit?.(vals); } }),
    };
  }, [ctrl, state, mismatches, git, shops, refreshShops, clearLog, exit]);

  const commands = useMemo(() => buildCommands(ctx), [ctx]);

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

  // Wysokość logu dobrana tak, by status + paleta + input + log mieściły się w
  // terminalu (inaczej Ink dokleja kolejną klatkę = zdublowany layout).
  const reserve = 12 + (filtered.length ? filtered.length + 2 : 0);
  const logRows = Math.max(3, Math.min(14, termRows - reserve));

  return (
    <Box flexDirection="column">
      <Static items={BANNER_ITEMS}>
        {(item) => (
          <Box key={item} flexDirection="column" marginTop={1} marginBottom={1} paddingLeft={1}>
            <Banner />
          </Box>
        )}
      </Static>

      <StatusBar state={state} mismatches={mismatches} git={git} version={version} />

      {mode.type === 'input' && <LogPane log={log} rows={logRows} />}

      {mode.type === 'picker' && (
        <Picker title={mode.title} items={mode.items} onSelect={mode.onSelect} onCancel={() => setMode({ type: 'input' })} />
      )}

      {mode.type === 'form' && (
        <Form title={mode.title} fields={mode.fields} onSubmit={mode.onSubmit} onCancel={() => setMode({ type: 'input' })} />
      )}

      {mode.type === 'input' && (
        <>
          {filtered.length > 0 && <CommandPalette items={filtered} index={highlight} />}
          <Box borderStyle="round" borderColor="gray" paddingX={1}>
            <Text color="#ff5a1f">› </Text>
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={onSubmit}
              placeholder="wpisz / aby zobaczyć komendy (np. /login, /templates, /git) · Ctrl+C wyjście"
            />
          </Box>
        </>
      )}
    </Box>
  );
}
