import * as React from 'react';
import { cn } from '../../foundations/cn';

/** The framed main-content surface shared by every screen: a full-window-height
 * rounded, bordered, elevated card that floats inside a delicate 8px inset from
 * the window edges. `center` centers a max-width block inside it (onboarding /
 * template picker); the default fills it top-to-bottom (the Hub header + body).
 * `className` styles the inner card (e.g. `p-8` for centered layouts). */
export interface ContentSurfaceProps {
  center?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function ContentSurface({ center = false, className, children }: ContentSurfaceProps) {
  return (
    <div className="h-full overflow-hidden p-2">
      <div
        className={cn(
          'h-full rounded-2xl border border-border bg-surface-base shadow-lg',
          center ? 'flex items-center justify-center overflow-y-auto' : 'flex flex-col overflow-hidden',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
