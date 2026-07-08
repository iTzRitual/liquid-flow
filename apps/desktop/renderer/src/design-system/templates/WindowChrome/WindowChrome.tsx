import * as React from 'react';
import { X } from '../../foundations/icons';
import { cn } from '../../foundations/cn';

export type Platform = 'mac' | 'win' | 'linux';

/** The frameless app window: a rounded, elevated surface with an invisible
 * top drag strip and window controls overlaid in the corner (macOS traffic
 * lights top-left; Windows/Linux min/max/close top-right). Pure layout — content
 * fills the whole surface via `children`; the caller wires the control handlers.
 * In Electron this pairs with `frame:false` + IPC. */
export interface WindowChromeProps {
  platform?: Platform;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  children?: React.ReactNode;
  className?: string;
}

/** macOS traffic-light colors are OS chrome constants, not theme tokens. */
const MAC_DOTS = [
  { color: '#ff5f57', label: 'close' as const },
  { color: '#febc2e', label: 'minimize' as const },
  { color: '#28c840', label: 'maximize' as const },
];

function MacControls({ onMinimize, onMaximize, onClose }: Pick<WindowChromeProps, 'onMinimize' | 'onMaximize' | 'onClose'>) {
  const handlers = { close: onClose, minimize: onMinimize, maximize: onMaximize };
  return (
    <div className="flex items-center gap-2">
      {MAC_DOTS.map((dot) => (
        <button
          key={dot.label}
          type="button"
          aria-label={dot.label}
          onClick={handlers[dot.label]}
          className="h-3 w-3 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: dot.color }}
        />
      ))}
    </div>
  );
}

function WinLinuxControls({
  onMinimize,
  onMaximize,
  onClose,
  rounded,
}: Pick<WindowChromeProps, 'onMinimize' | 'onMaximize' | 'onClose'> & { rounded: boolean }) {
  const base = cn(
    'flex h-6 w-6 items-center justify-center text-text-secondary transition-colors hover:bg-surface-muted',
    rounded ? 'rounded-full' : 'rounded',
  );
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="minimize" onClick={onMinimize} className={base}>
        <span className="h-[1.5px] w-3.5 bg-current" />
      </button>
      <button type="button" aria-label="maximize" onClick={onMaximize} className={base}>
        <span className="h-3 w-3 rounded-[2px] border border-current" />
      </button>
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className={cn(base, 'hover:!bg-feedback-error hover:text-surface-base')}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function WindowChrome({
  platform = 'mac',
  onMinimize,
  onMaximize,
  onClose,
  children,
  className,
}: WindowChromeProps) {
  const handlers = { onMinimize, onMaximize, onClose };

  if (platform !== 'mac') {
    // Windows/Linux controls get their own strip on the window's gray background,
    // above the app content, instead of floating over it — so they never overlap
    // a screen's white ContentSurface and screens don't need to reserve clearance.
    return (
      <div className={cn('flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface-app shadow-lg', className)}>
        <div className="drag-region flex h-9 shrink-0 items-center justify-end pr-3">
          <div className="no-drag">
            <WinLinuxControls {...handlers} rounded={platform === 'linux'} />
          </div>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  // macOS traffic lights float over the content's top-left corner instead — the
  // Sidebar organism reserves clearance for them there (see Sidebar's className).
  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-2xl bg-surface-app shadow-lg', className)}>
      <div className="h-full w-full">{children}</div>

      {/* Invisible strip along the top edge for dragging the window. */}
      <div className="drag-region pointer-events-auto absolute inset-x-0 top-0 z-10 h-9" />

      <div className="no-drag absolute left-0 top-0 z-20 flex items-center p-4">
        <MacControls {...handlers} />
      </div>
    </div>
  );
}
