// Hook mostkujący rdzeń (@liquidflow/core Controller) do stanu Reacta/Ink.
// Subskrybuje zdarzenia kontrolera (log / mismatches / state / git) i wystawia
// aktualny stan oraz odświeżanie listy sklepów.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Controller } from '@liquidflow/core';

const LOG_LIMIT = 500;

export function useController() {
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = new Controller({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
  }
  const ctrl = ref.current;

  const [state, setState] = useState(() => ctrl.getState());
  const [mismatches, setMismatches] = useState([]);
  const [log, setLog] = useState([]);
  // Rośnie przy każdym przełączeniu kanału logu (zmiana sklepu/szablonu) — App
  // używa go, by zjechać scrollem na dół świeżego strumienia.
  const [logVersion, setLogVersion] = useState(0);
  const [git, setGit] = useState(null);
  const [shops, setShops] = useState(() => ctrl.listShops());
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    const onLog = (e) => setLog((l) => [...l, e].slice(-LOG_LIMIT));
    // Pełna podmiana bufora po przełączeniu kanału (osobny log per szablon/sklep).
    const onLogReset = (entries) => { setLog(entries.slice(-LOG_LIMIT)); setLogVersion((v) => v + 1); };
    const onMis = (m) => setMismatches(m);
    const onState = (s) => setState(s);
    const onGit = (g) => setGit(g);
    const onProgress = (p) => {
      if (p.phase === 'download') {
        if (p.state === 'done') setProgress(null);
        else setProgress({ kind: 'download', label: 'Pobieranie plików ze sklepu', done: p.done || 0, total: p.total || 0, indeterminate: p.state === 'start' });
      } else if (p.phase === 'check') {
        if (p.state === 'done') setProgress(null);
        else setProgress({ kind: 'check', label: 'Sprawdzanie niezgodności plików', indeterminate: true });
      } else if (p.phase === 'ready') {
        setProgress(null);
      }
    };

    ctrl.on('log', onLog);
    ctrl.on('log:reset', onLogReset);
    ctrl.on('mismatches', onMis);
    ctrl.on('state', onState);
    ctrl.on('git', onGit);
    ctrl.on('progress', onProgress);

    setLog(ctrl.getLog(0));
    setState(ctrl.getState());
    setShops(ctrl.listShops());

    return () => {
      ctrl.off('log', onLog);
      ctrl.off('log:reset', onLogReset);
      ctrl.off('mismatches', onMis);
      ctrl.off('state', onState);
      ctrl.off('git', onGit);
      ctrl.off('progress', onProgress);
      ctrl.dispose();
    };
  }, [ctrl]);

  const refreshShops = useCallback(() => setShops(ctrl.listShops()), [ctrl]);
  const clearLog = useCallback(() => setLog([]), []);

  return { ctrl, state, mismatches, log, logVersion, git, shops, progress, refreshShops, clearLog };
}
