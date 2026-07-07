import * as React from 'react';
import { cn } from '../../foundations/cn';

/** The connected-app layout: a fixed-width sidebar slot on the left and a
 * flexible main region on the right. Pure structural layout — the caller fills
 * both slots (Sidebar organism on the left; a header + content on the right).
 * Used by the SelectTemplate and Hub screens. */
export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ sidebar, children, className }: AppShellProps) {
  return (
    <div className={cn('flex h-full overflow-hidden bg-surface-app', className)}>
      <div className="shrink-0">{sidebar}</div>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
