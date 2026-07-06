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

// Counter of unique overlay identifiers. Every opened screen (mode) gets its own
// `uid`, used as the React `key` of the rendered component. This way, when moving
// BETWEEN two screens of the SAME type (e.g. picker → picker in the /git submenu,
// or connect → the "remove shop" picker), React REMOUNTS the component instead of
// reusing the instance — otherwise the cursor's internal `useState` would survive
// the transition and `initialIndex` (which only seeds the initial state) would be
// ignored, so returning to the parent via Esc would lose the position. Within a
// single screen the uid is stable (no needless remounts on navigation/toggle/App re-render).
let MODE_UID = 0;
const nextUid = () => ++MODE_UID;
import Picker from './components/Picker.jsx';
import ConflictList from './components/ConflictList.jsx';
import ConnectList from './components/ConnectList.jsx';
import CheckList from './components/CheckList.jsx';
import Form from './components/Form.jsx';
import DiffView from './components/DiffView.jsx';
import InfoScreen from './components/InfoScreen.jsx';

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { ctrl, ready, t, state, mismatches, log, logVersion, git, shops, progress, refreshShops, clearLog } = useController();

  // mode: { type: 'input' } | { type: 'picker', ... } | { type: 'form', ... }
  const [mode, setMode] = useState({ type: 'input' });
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [termRows, setTermRows] = useState(stdout?.rows || 24);
  const [termCols, setTermCols] = useState(stdout?.columns || 80);
  // UI preferences (log wrapping, header mode) live in the core config — we read
  // them from `state` (persisted across runs), and writes go through `ctrl`
  // (which emits 'state' → a refresh). The setters keep the old signature for the commands.
  const logWrap = !!state?.logWrap;
  const setLogWrap = (v) => ctrl?.setUiPref('logWrap', v);
  const headerPref = state?.headerMode || 'auto';
  const setHeaderPref = (v) => ctrl?.setUiPref('headerMode', v);
  const [logScroll, setLogScroll] = useState(0); // number of visual rows from the bottom (0 = newest)
  // "Back" navigation: every opened overlay gets a `parent` pointer (the screen we
  // came from). Esc returns to the parent, and only from the top-level screen back
  // to the input. `pendingParentRef` carries the parent through asynchronous opens
  // (loader → screen): we set it at the moment of user interaction (a selection in
  // the picker/form, an action in connect/conflicts), and the helper opening the
  // next overlay consumes it. Cleared on command start (a jump from the input has
  // no parent) and on going back.
  const pendingParentRef = useRef(null);
  const takeParent = () => { const p = pendingParentRef.current; pendingParentRef.current = null; return p || null; };
  // Back out of an overlay: show the parent (if any), otherwise return to the input.
  const cancelTo = (m) => {
    pendingParentRef.current = null;
    const p = m?.parent;
    if (p) setMode(p);
    else { setMode({ type: 'input' }); setQuery(''); }
  };

  // React to terminal resize. On resize Ink only recomputes the layout of the
  // existing tree (it does not re-invoke components) and does not clear the screen —
  // so: (1) we clear the whole screen so the terminal does not leave wrapped,
  // too-wide rows from the previous size, (2) we update the state (rows+cols),
  // which forces a full re-render of all width-dependent components (Divider
  // computes '─'×cols, Header switches columns↔rows).
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

  // Helpers passed to the commands — opening overlays and safe actions.
  const ctx = useMemo(() => {
    const back = () => { setMode({ type: 'input' }); setQuery(''); };
    const safe = (fn) => Promise.resolve().then(fn).catch((e) => corelog.logErr(e?.message || String(e)));
    return {
      ctrl, t, state, mismatches, git, shops, refreshShops, clearLog, exit, safe,
      logWrap, setLogWrap,
      headerPref, setHeaderPref,
      // Selecting an item closes the picker (back → input), and we record the parent
      // pointer just before the handler — if it opens another overlay, that overlay
      // gets this picker as its parent (Esc returns here, not to the input).
      openPicker: (title, items, onSelect, opts = {}) => {
        const self = { type: 'picker', uid: nextUid(), title, items, onSlash: opts.onSlash, parent: takeParent() };
        self.onSelect = (it, i) => { pendingParentRef.current = self; back(); onSelect?.(it, i); };
        setMode(self);
      },
      openForm: (title, fields, onSubmit) => {
        const self = { type: 'form', uid: nextUid(), title, fields, parent: takeParent() };
        self.onSubmit = (vals) => { pendingParentRef.current = self; back(); onSubmit?.(vals); };
        setMode(self);
      },
      // conflicts screen (cards + bulk footer). The handlers drive the mode
      // themselves (loader/refresh/confirmation), so we do not wrap them in back().
      // The screen is always entered from the input (/conflicts or the indicator),
      // so parent = input; its actions (confirmations) get this screen as their parent.
      openConflicts: (data) => {
        pendingParentRef.current = null;
        const self = { type: 'conflicts', uid: nextUid(), ...data, parent: null };
        self.onAction = (...a) => { pendingParentRef.current = self; data.onAction?.(...a); };
        self.onBulk = (...a) => { pendingParentRef.current = self; data.onBulk?.(...a); };
        setMode(self);
      },
      // connect screen (shop list + action footer). The handlers drive the mode
      // themselves (loader/form/sub-picker), so we do not wrap them in back().
      // The actions (Add/Remove/select shop) record this screen as their parent, so
      // Esc from the form/sub-picker returns to the shop list, not to the input.
      openCheckList: (data) => {
        const self = { type: 'checklist', uid: nextUid(), ...data, parent: takeParent() };
        self.onConfirm = (...a) => { pendingParentRef.current = self; data.onConfirm?.(...a); };
        setMode(self);
      },
      openConnect: (data) => {
        const self = { type: 'connect', uid: nextUid(), ...data, parent: takeParent() };
        self.onShop = (...a) => { pendingParentRef.current = self; data.onShop?.(...a); };
        self.onAction = (...a) => { pendingParentRef.current = self; data.onAction?.(...a); };
        setMode(self);
      },
      // diff preview screen (read-only). Esc returns to the parent (the conflicts screen).
      openDiff: (data) => {
        const self = { type: 'diff', uid: nextUid(), ...data, parent: takeParent() };
        setMode(self);
      },
      // a short, self-dismissing message (e.g. "no conflicts") — instead of a log
      // flash, it stays on screen for `duration` ms, with a countdown, and dismisses
      // on ANY key. Always returns to the input (only ever entered from the input).
      openInfo: (data) => {
        pendingParentRef.current = null;
        const self = { type: 'info', uid: nextUid(), ...data };
        self.onDismiss = () => { back(); data.onDismiss?.(); };
        setMode(self);
      },
      // drop the remembered parent — when the screen we came from is no longer
      // current (e.g. after `init` the "no repo" screen disappears), the next opened
      // view should return via Esc to the input, not to the stale screen.
      dropParent: () => { pendingParentRef.current = null; },
      // exit the startup list to the plain input with the palette open
      skipToInput: () => { setMode({ type: 'input' }); setQuery('/'); },
      // return to a clean input (e.g. when an operation with a loader opens no view)
      backToInput: back,
      // show a loading screen for the duration of an operation (e.g. fetching the
      // template list), after which fn opens the actual view; on error, return to the
      // input. The optional `title` overrides the loader's default header. Using the
      // loader instead of a "bare" input also eliminates the main-screen flash when fn
      // is asynchronous (back()→input manages to render before the actual view opens)
      // — the spinner holds the frame until the view opens.
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

  // Auto-navigation after a conflict is resolved in the background: `/conflicts` →
  // Preview (`mode.type === 'diff'`) remembers the VIEWED file (`watchMismatch`).
  // The periodic conflict poll (`mismatches`, see useController) keeps running even
  // while you look at a diff / edit in an IDE — if an IDE save caused the watcher to
  // upload the file (or download it) and that file dropped out of `mismatches`, we
  // navigate ourselves: to the refreshed conflict list (if any remain) or to the
  // main screen (if it was the last — `renderConflicts([])` calls `backToInput()`
  // with a "no conflicts" message). After navigating, `mode.type` is no longer
  // `'diff'`, so the effect does not repeat for the same file.
  useEffect(() => {
    if (mode.type !== 'diff' || !mode.watchMismatch) return;
    const { fileMode, name } = mode.watchMismatch;
    const stillConflicting = mismatches.some((m) => m.File.Mode === fileMode && m.File.Name === name);
    if (stillConflicting) return;
    commands.renderConflicts?.(mismatches);
  }, [mismatches, mode, commands]);

  // On startup (when disconnected) immediately open the shop list to connect.
  const booted = useRef(false);
  useEffect(() => {
    if (!ready || booted.current) return;
    if (state && !state.currentShop) {
      booted.current = true;
      pendingParentRef.current = null;
      commands.find((c) => c.name === '/connect')?.run();
    }
  }, [ready, state, commands]);

  // Filter the palette based on the typed text (after the leading '/').
  const palette = query.startsWith('/') ? query.slice(1).toLowerCase() : null;
  const filtered = useMemo(() => {
    if (palette === null) return [];
    return commands.filter((c) => c.name.slice(1).toLowerCase().includes(palette));
  }, [commands, palette]);

  useEffect(() => { setHighlight(0); }, [query]);
  // After switching the log channel (shop/template change) scroll to the bottom,
  // to show the newest stream (rather than keeping the previous channel's scroll).
  useEffect(() => { setLogScroll(0); }, [logVersion]);

  // --- dimensions and derived values (before useInput, because scroll uses them) ---
  const paletteOpen = filtered.length > 0;
  // The header degrades with window height: full → compact (1 row) → hidden (the
  // overlay "takes over" the header), and when even without the header there is no
  // room for the mode's minimum → guard (the "window too small" screen). Computed in layout.js.
  const hl = headerLayout({ termRows, termCols, mode, pref: headerPref });
  const headerMode = hl.mode; // 'full' | 'compact' | 'none' | 'guard'
  const tooSmall = headerMode === 'guard';
  // Actual header height (with the top divider). 0 when hidden/guard.
  const HEADER = hl.height;
  // The log fills the available height. The progress bar, when visible, takes 1 row.
  const progressRows = progress ? 1 : 0;
  const bottomSpacer = headerLayout({ termRows, termCols, mode, pref: 'auto' }).mode === 'full';
  const logRows = Math.max(1, termRows - HEADER - progressRows - (bottomSpacer ? 3 : 2));
  // palette (when the log does not fit alongside): full height below the header
  const paletteMax = Math.max(3, termRows - HEADER - 1);
  // log: visual rows (depending on the wrap mode and width) + scroll range
  const vlines = useMemo(() => buildVlines(log, logWrap, termCols), [log, logWrap, termCols]);
  // +1, because the "↓ newer" indicator at the top takes a row from the window;
  // without it the oldest entries (as many as the indicators occupy) would be unreachable.
  const maxScroll = vlines.length > logRows ? vlines.length - logRows + 1 : 0;
  const logScrollClamped = Math.min(logScroll, maxScroll);

  // --- overlays (picker/form/conflicts/connect/loading) ---
  // A consistent rule: the screen sticks to the BOTTOM (like the input), and above
  // it — the log as context (a filler). We compute the screen height from the DATA
  // (how many items), so a short screen does not take the whole height — the log
  // gets the rest; a long screen windows itself and the log disappears (1 log line
  // is NOT required — it is only filler).
  //
  // `overlayAvail` MUST equal the REAL height of the overlay's flex box, otherwise
  // `justifyContent:flex-end` pushes a too-short stack down and an empty row (gap)
  // remains. This flex box is the only (growing) child of the root after the header, so:
  //   root(termRows) − HEADER = termRows − HEADER.
  const overlayAvail = Math.max(1, termRows - HEADER);
  // Natural (full) overlay height — the SAME number layout.js uses to degrade the
  // header, so the "overlay windows itself" threshold == the "header gives way"
  // threshold (a single source of truth in layout.js → the header shrinks exactly
  // when we would otherwise have to window the content).
  const overlayNatural = naturalBodyRows(mode);
  const ovRows = Math.min(overlayNatural, overlayAvail);
  const ovMax = Math.max(1, ovRows - 4); // screen body (screen chrome = 4 rows)
  // log above the screen (no gap row — the screen sits directly under the log); we
  // show it only when ≥2 rows remain — a 1-row log is just the "↑ more" indicator
  // (no content), and the log here is only a filler, so we then omit it (the screen
  // takes the whole height).
  const ovLogRows = Math.max(0, overlayAvail - ovRows);
  const ovShowLog = ovLogRows >= 2 && log.length > 0;

  // --- palette in input mode ---
  // Slash does NOT hide the log: the palette occupies a slice near the bottom (just
  // above the input), and the log fills the rest above it. We only fit it when there
  // is reasonably enough height.
  const showLogWithPalette = log.length > 0 && logRows >= 10;
  const logWithPalette = paletteOpen && showLogWithPalette;
  // Active mode: log > divider > hints > input (the same divider as the passive one,
  // just below the log; no spacer). Divider(1)+input(1) are already in the logRows
  // budget (−3); the palette is an additional sibling, so the log yields it as many
  // rows as it takes. −4 leaves ≥3 log rows above the divider.
  const paletteCap = Math.max(3, Math.min(filtered.length, logRows - 4));
  const paletteLogRows = Math.max(1, logRows - paletteCap);

  // Keyboard/scroll in input mode. Palette open → palette navigation; palette
  // closed → arrows/wheel (alt-scroll) scroll the log on the main screen.
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
    setLogScroll(0); // after a command return to the bottom, to see the fresh result
    if (!v.startsWith('/')) return;
    pendingParentRef.current = null; // a command starts from the input — no parent
    // an exact match takes precedence, otherwise the highlighted item
    const exact = commands.find((c) => c.name === v.split(' ')[0]);
    const target = exact || filtered[highlight];
    if (target) target.run();
  };

  // Wraps the overlay screen in a shared action area: the log on top (context,
  // filler), the screen stuck to the bottom — consistent with the input. This is a
  // FUNCTION (not a component), so the Box has a stable identity in the tree and does
  // not remount the screen (preserving the pickers' useState). The log is a filler —
  // when there is no room (a low window), `ovShowLog` is false and the screen takes
  // the whole height (the overlay "takes over" the hidden header's space). No gap row
  // between the log and the frame — the screen sits directly under the (dimmed) log,
  // like the input under the divider.
  const wrapAction = (node) => {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
        {ovShowLog && <LogPane vlines={vlines} rows={ovLogRows} scroll={0} t={t} dim />}
        {node}
      </Box>
    );
  };

  // The window is too low to fit the current mode even without the header — show a
  // request to enlarge instead of a broken/duplicated view (on overflow Ink appends
  // a copy of the frame). The message fits in 1 row (truncate-end).
  if (ready === false || !ctrl) {
    return (
      <Box height={termRows} alignItems="center" justifyContent="center">
        <Spinner color="cyan" /><Text> {t.Loading}</Text>
      </Box>
    );
  }

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
        <Picker key={mode.uid} title={mode.title} items={mode.items} onSelect={mode.onSelect} onSlash={mode.onSlash} onCancel={() => cancelTo(mode)} maxRows={ovMax} initialIndex={mode.index || 0} onIndexChange={(i) => { mode.index = i; }} t={t} />
      )}

      {mode.type === 'form' && wrapAction(
        <Form key={mode.uid} title={mode.title} fields={mode.fields} onSubmit={mode.onSubmit} onCancel={() => cancelTo(mode)} t={t} />
      )}

      {mode.type === 'conflicts' && wrapAction(
        <ConflictList key={mode.uid} title={mode.title} files={mode.files} bulk={mode.bulk} onAction={mode.onAction} onBulk={mode.onBulk} onCancel={() => cancelTo(mode)} maxRows={ovMax} initialIndex={mode.index || 0} onIndexChange={(i) => { mode.index = i; }} t={t} />
      )}

      {mode.type === 'checklist' && wrapAction(
        <CheckList key={mode.uid} title={mode.title} items={mode.items} onConfirm={mode.onConfirm} onCancel={() => cancelTo(mode)} maxRows={ovMax} t={t} />
      )}

      {mode.type === 'connect' && wrapAction(
        <ConnectList key={mode.uid} title={mode.title} shops={mode.shops} actions={mode.actions} onShop={mode.onShop} onAction={mode.onAction} onSlash={mode.onSlash} onCancel={() => cancelTo(mode)} maxRows={ovMax} initialIndex={mode.index || 0} onIndexChange={(i) => { mode.index = i; }} t={t} />
      )}

      {mode.type === 'diff' && wrapAction(
        <DiffView key={mode.uid} title={mode.title} preview={mode.preview} onCancel={() => cancelTo(mode)} maxRows={ovMax} expanded={!!mode.expanded} onToggleExpand={() => setMode((m) => ({ ...m, expanded: !m.expanded }))} onOpenIde={mode.onOpenIde} t={t} />
      )}

      {mode.type === 'info' && wrapAction(
        <InfoScreen key={mode.uid} title={mode.title} message={mode.message} duration={mode.duration} color={mode.color} onDismiss={mode.onDismiss} t={t} />
      )}

      {mode.type === 'input' && (
        <>
          {/* The middle grows and pushes the action area to the bottom. The log
              fills the top, below it a divider, and beneath (when the palette is
              open) the hints just above the input: log > divider > hints > input.
              Slash does not hide the log. */}
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
          {bottomSpacer && <Box height={1} />}
        </>
      )}
    </Box>
  );
}
