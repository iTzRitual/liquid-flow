import React, { useEffect, useRef } from 'react';
import { useApp } from '../App.jsx';
import { fmtDate } from '@/lib/utils';

export default function LogPanel() {
  const { t, log } = useApp();
  const ref = useRef(null);

  // log jest trzymany od najnowszego — wyświetlamy w kolejności malejącej
  return (
    <div ref={ref} className="h-full overflow-y-auto rounded-lg border border-border bg-card/40 p-2 font-mono text-xs">
      {log.length === 0 && <p className="p-3 text-muted-foreground">{t.NoEntries}</p>}
      <ul className="space-y-0.5">
        {log.map((e) => (
          <li key={e.Id} className="flex gap-3 rounded px-2 py-1 hover:bg-accent/50">
            <span className="shrink-0 text-muted-foreground">{fmtDate(e.TS)}</span>
            <span style={{ color: e.Color }}>{e.Text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
