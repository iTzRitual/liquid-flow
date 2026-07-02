// Hook mostkujący rdzeń (@liquidflow/core Controller) do stanu Reacta/Ink.
// Subskrybuje zdarzenia kontrolera (log / mismatches / state / git) i wystawia
// aktualny stan oraz odświeżanie listy sklepów.

import { useEffect, useState, useCallback } from 'react';
import { connectController, translationsFor } from '@liquidflow/core';

const LOG_LIMIT = 500;

export function useController() {
  const [ctrl, setCtrl] = useState(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState(null);
  const [t, setT] = useState(() => translationsFor('pl'));
  const [mismatches, setMismatches] = useState([]);
  const [log, setLog] = useState([]);
  // Rośnie przy każdym przełączeniu kanału logu (zmiana sklepu/szablonu) — App
  // używa go, by zjechać scrollem na dół świeżego strumienia.
  const [logVersion, setLogVersion] = useState(0);
  const [git, setGit] = useState(null);
  const [shops, setShops] = useState([]);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let client = null;
    let disposed = false;

    const onLog = (e) => setLog((l) => [...l, e].slice(-LOG_LIMIT));
    // Pełna podmiana bufora po przełączeniu kanału (osobny log per szablon/sklep).
    const onLogReset = (entries) => { setLog((entries || []).slice(-LOG_LIMIT)); setLogVersion((v) => v + 1); };
    const onMis = (m) => setMismatches(m || []);
    // Zmiana stanu = potencjalna zmiana połączenia (login/logout) → odśwież listę
    // sklepów, żeby flaga isCurrent (● bieżący / URL) była zawsze aktualna.
    const onState = (s) => {
      if (!s) return;
      setState(s);
      setT(translationsFor(s.language));
      if (client) {
        client.listShops().then((shp) => { if (!disposed && shp) setShops(shp); }).catch(() => {});
      }
    };
    const onGit = (g) => setGit(g);
    const onProgress = (p) => {
      const lang = client?.getState()?.language || 'pl';
      const tr = translationsFor(lang);
      if (p.phase === 'download') {
        if (p.state === 'done') setProgress(null);
        else setProgress({ kind: 'download', label: tr.DownloadingFiles, done: p.done || 0, total: p.total || 0, indeterminate: p.state === 'start' });
      } else if (p.phase === 'check') {
        if (p.state === 'done') setProgress(null);
        else setProgress({ kind: 'check', label: tr.CheckingMismatch, indeterminate: true });
      } else if (p.phase === 'ready') {
        setProgress(null);
      }
    };

    (async () => {
      client = await connectController({ insecureTLS: process.env.LIQUID_FLOW_INSECURE === '1' });
      if (disposed) { client.dispose(); return; }

      client.on('log', onLog);
      client.on('log:reset', onLogReset);
      client.on('mismatches', onMis);
      client.on('state', onState);
      client.on('git', onGit);
      client.on('progress', onProgress);

      const st = client.getState();
      const shp = await client.listShops();
      if (!disposed) {
        if (st) {
          setState(st);
          setT(translationsFor(st.language));
        }
        setLog(client.getLog(0));
        setShops(shp || []);
        setCtrl(client);
        setReady(true);
      }
    })();

    return () => {
      disposed = true;
      if (client) {
        client.off('log', onLog);
        client.off('log:reset', onLogReset);
        client.off('mismatches', onMis);
        client.off('state', onState);
        client.off('git', onGit);
        client.off('progress', onProgress);
        client.dispose();
      }
    };
  }, []);

  const refreshShops = useCallback(() => {
    if (ctrl) {
      ctrl.listShops().then((shp) => setShops(shp || [])).catch(() => {});
    }
  }, [ctrl]);

  const clearLog = useCallback(() => setLog([]), []);

  return { ctrl, ready, t, state, mismatches, log, logVersion, git, shops, progress, refreshShops, clearLog };
}
