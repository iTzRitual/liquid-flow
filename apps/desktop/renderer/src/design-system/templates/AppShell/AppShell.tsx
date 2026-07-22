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
 * `onSidebarResizeStart` is set a drag handle appears on the seam — while a drag
 * is in flight the caller passes `sidebarResizing` so width changes apply
 * instantly instead of tweening. */
export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  sidebarResizing?: boolean;
  onSidebarResizeStart?: (e: React.PointerEvent) => void;
  resizeHandleLabel?: string;
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

      {onSidebarResizeStart && !sidebarCollapsed && (
        // Negative margins center the grabber on the seam without adding layout
        // width; it sits outside the overflow-hidden wrapper so it isn't clipped.
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={resizeHandleLabel}
          onPointerDown={onSidebarResizeStart}
          className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none"
        >
          <span
            className={cn(
              'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors',
              sidebarResizing ? 'bg-interactive-primary' : 'bg-border group-hover:bg-interactive-primary',
            )}
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
