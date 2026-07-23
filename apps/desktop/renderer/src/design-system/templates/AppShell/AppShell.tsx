import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../foundations/cn';

/** The connected-app layout: a fixed-width sidebar slot on the left and a
 * flexible main region on the right. Pure structural layout — the caller fills
 * both slots (Sidebar organism on the left; a header + content on the right).
 * Used by the SelectTemplate and Hub screens.
 *
 * The sidebar column is width-animated via Motion: passing `sidebarCollapsed`
 * slides it to zero width (kept mounted but `aria-hidden`/`inert`, so it leaves
 * the a11y tree and tab order); `sidebarWidth` drives its size. When
 * `onSidebarResizeStart` is set a resize handle sits on the content card's left
 * border — clicking it collapses the rail, dragging resizes it; hovering reveals
 * a grab bullet and a hint tooltip. While a drag is in flight the caller passes
 * `sidebarResizing` so width changes apply instantly instead of tweening. */
export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  sidebarResizing?: boolean;
  onSidebarResizeStart?: (e: React.PointerEvent) => void;
  resizeHandleLabel?: string;
  /** First tooltip line (e.g. "Click to collapse"); paired with `collapseShortcut`. */
  collapseHint?: string;
  /** Keyboard hint rendered as a chip after `collapseHint` (e.g. "⌘B"). */
  collapseShortcut?: string;
  /** Second tooltip line (e.g. "Drag to resize"). */
  resizeHint?: string;
}

export function AppShell({
  sidebar,
  children,
  className,
  sidebarWidth = 320,
  sidebarCollapsed = false,
  sidebarResizing = false,
  onSidebarResizeStart,
  resizeHandleLabel,
  collapseHint,
  collapseShortcut,
  resizeHint,
}: AppShellProps) {
  return (
    <div className={cn('flex h-full overflow-hidden bg-surface-app', className)}>
      <motion.div
        className="shrink-0 overflow-hidden"
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        transition={
          sidebarResizing ? { duration: 0 } : { type: 'tween', duration: 0.24, ease: [0.4, 0, 0.2, 1] }
        }
        aria-hidden={sidebarCollapsed || undefined}
        {...(sidebarCollapsed ? { inert: '' } : {})}
      >
        {/* Fixed-width inner box: content stays laid out at sidebarWidth while the
            wrapper animates to 0, so collapsing slides it out instead of
            reflowing the shop rows down to nothing. */}
        <div style={{ width: sidebarWidth }} className="h-full">
          {sidebar}
        </div>
      </motion.div>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {onSidebarResizeStart && !sidebarCollapsed && (
          // Sits centered on the content card's left border (ContentSurface's 8px
          // p-2 inset), tracking the seam as the rail resizes. Invisible until
          // hover — click collapses, drag resizes (both wired in the caller's
          // pointer handler).
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={resizeHandleLabel}
            onPointerDown={onSidebarResizeStart}
            className="group absolute inset-y-0 left-2 z-30 w-3 -translate-x-1/2 cursor-col-resize touch-none select-none"
          >
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity',
                sidebarResizing
                  ? 'bg-interactive-primary opacity-100'
                  : 'bg-text-secondary opacity-0 group-hover:opacity-100',
              )}
            />
            {(collapseHint || resizeHint) && (
              <div
                role="tooltip"
                className="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#2b2b2b] px-3 py-2 font-ui text-[13px] leading-snug text-white shadow-lg group-hover:block"
              >
                {collapseHint && (
                  <span className="flex items-center gap-2">
                    {collapseHint}
                    {collapseShortcut && (
                      <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-medium text-white/80">
                        {collapseShortcut}
                      </kbd>
                    )}
                  </span>
                )}
                {resizeHint && <span className="block text-white/70">{resizeHint}</span>}
              </div>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
