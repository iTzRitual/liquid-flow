import React from 'react';
import { Minus, Square, X } from 'lucide-react';

// Bezramkowe okno aplikacji z WŁASNYMI kontrolkami per platforma (macOS / Windows
// / Linux) — zamiast domyślnego natywnego paska. To wizualne źródło prawdy dla
// wyglądu okna; w Electronie łączy się to z `frame:false` + IPC (min/max/close).
//
// Kontrolki są `no-drag` (klikalne), a sam pasek `drag-region` (przeciąganie okna).

const TRAFFIC = [
  { key: 'close', color: '#ff5f57' },
  { key: 'min', color: '#febc2e' },
  { key: 'max', color: '#28c840' },
];

function MacControls({ onMinimize, onMaximize, onClose }) {
  const handlers = { close: onClose, min: onMinimize, max: onMaximize };
  return (
    <div className="no-drag group flex items-center gap-2">
      {TRAFFIC.map(({ key, color }) => (
        <button
          key={key}
          onClick={handlers[key]}
          aria-label={key}
          className="h-3 w-3 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function WinControls({ onMinimize, onMaximize, onClose }) {
  const btn = 'no-drag flex h-full w-12 items-center justify-center text-foreground/80 transition-colors';
  return (
    <div className="-mr-3 flex h-full items-stretch">
      <button aria-label="minimize" onClick={onMinimize} className={`${btn} hover:bg-black/10 dark:hover:bg-white/10`}>
        <Minus className="h-4 w-4" />
      </button>
      <button aria-label="maximize" onClick={onMaximize} className={`${btn} hover:bg-black/10 dark:hover:bg-white/10`}>
        <Square className="h-3.5 w-3.5" />
      </button>
      <button aria-label="close" onClick={onClose} className={`${btn} hover:bg-[#e81123] hover:text-white`}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function LinuxControls({ onMinimize, onMaximize, onClose }) {
  // Styl zbliżony do GNOME/Adwaita — okrągłe, płaskie przyciski.
  const btn =
    'no-drag flex h-6 w-6 items-center justify-center rounded-full bg-black/10 text-foreground/80 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20';
  return (
    <div className="flex items-center gap-2">
      <button aria-label="minimize" onClick={onMinimize} className={btn}><Minus className="h-3.5 w-3.5" /></button>
      <button aria-label="maximize" onClick={onMaximize} className={btn}><Square className="h-3 w-3" /></button>
      <button aria-label="close" onClick={onClose} className={btn}><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function WindowChrome({
  platform = 'mac',
  title = 'Liquid Flow',
  children,
  onMinimize = () => {},
  onMaximize = () => {},
  onClose = () => {},
}) {
  const mac = platform === 'mac';
  const handlers = { onMinimize, onMaximize, onClose };
  const rounded = mac ? 'rounded-xl' : platform === 'linux' ? 'rounded-lg' : 'rounded-md';

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden border border-border bg-background shadow-2xl ${rounded}`}>
      <div className="drag-region flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/60 px-3 backdrop-blur">
        {/* Lewa strefa: macOS = światła; Win/Linux = logo + tytuł */}
        <div className="flex min-w-0 items-center gap-2">
          {mac ? (
            <MacControls {...handlers} />
          ) : (
            <>
              <img src="logo.png" alt="" className="h-4 w-4" />
              <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>
            </>
          )}
        </div>

        {/* Środek: wyśrodkowany tytuł tylko na macOS */}
        {mac && (
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground">
            {title}
          </span>
        )}

        {/* Prawa strefa: kontrolki Win/Linux; na macOS spacer balansujący światła */}
        <div className="flex h-full items-center">
          {platform === 'windows' && <WinControls {...handlers} />}
          {platform === 'linux' && <LinuxControls {...handlers} />}
          {mac && <div className="w-14" />}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
