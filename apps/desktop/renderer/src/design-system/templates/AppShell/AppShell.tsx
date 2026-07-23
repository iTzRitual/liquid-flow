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
 * border in both states — clicking it toggles the rail, dragging resizes it (and
 * from collapsed, drags it back open); hovering reveals a grab bullet and a hint
 * tooltip that follows the cursor. While a drag is in flight the caller passes
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
  /** Tooltip's first line when the rail is open (e.g. "Click to collapse"). */
  collapseHint?: string;
  /** Tooltip's first line when the rail is collapsed (e.g. "Click to expand"). */
  expandHint?: string;
  /** Keyboard hint rendered as a chip after the first line (e.g. "⌘B"). */
  collapseShortcut?: string;
  /** Tooltip's second line (e.g. "Drag to resize"). */
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
  expandHint,
  collapseShortcut,
  resizeHint,
}: AppShellProps) {
  const handleRef = React.useRef<HTMLDivElement>(null);
  // Vertical position of the hint tooltip: it tracks the cursor while the bullet
  // stays centered on the seam. Null when the pointer isn't over the handle.
  const [hintY, setHintY] = React.useState<number | null>(null);
  const trackHint = (e: React.PointerEvent) => {
    const rect = handleRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Keep the two-line tooltip clear of the window's top/bottom edges.
    setHintY(Math.min(Math.max(e.clientY - rect.top, 28), rect.height - 28));
  };
  const hintTitle = sidebarCollapsed ? expandHint : collapseHint;

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

      {/* Not overflow-hidden: the docked content card's shadow bleeds left onto
          the sidebar rail instead of being sliced off at the seam. */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {onSidebarResizeStart && (
          // Sits on the content card's left border in both states (on the docked
          // seam when open; on the card's inset border when collapsed, so the
          // rail can be dragged back out). Invisible until hover — click toggles,
          // drag resizes (both wired in the caller's pointer handler).
          <div
            ref={handleRef}
            role="separator"
            aria-orientation="vertical"
            aria-label={resizeHandleLabel}
            onPointerDown={onSidebarResizeStart}
            onPointerEnter={trackHint}
            onPointerMove={trackHint}
            onPointerLeave={() => setHintY(null)}
            className={cn(
              'group absolute inset-y-0 z-30 w-3 -translate-x-1/2 cursor-col-resize touch-none select-none',
              sidebarCollapsed ? 'left-2' : 'left-0',
            )}
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
            {/* Driven by hintY (not CSS :hover) so it appears already positioned
                at the cursor instead of flashing centered then jumping. */}
            {hintY !== null && (hintTitle || resizeHint) && (
              <div
                role="tooltip"
                style={{ top: hintY }}
                className="pointer-events-none absolute left-[22px] -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#2b2b2b] px-3 py-2 font-ui text-[13px] leading-snug text-white shadow-lg"
              >
                {hintTitle && (
                  <span className="flex items-center gap-2">
                    {hintTitle}
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
