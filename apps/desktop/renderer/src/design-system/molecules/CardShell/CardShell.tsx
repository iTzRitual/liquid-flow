import * as React from 'react';
import { cn } from '../../foundations/cn';

/** Surface container (white, slate-300 border, radius 12, subtle elevation) — the
 * base panel/card used across the screens. Padding is left to the consumer. */
export interface CardShellProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardShell = React.forwardRef<HTMLDivElement, CardShellProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border border-border bg-surface-base shadow-sm', className)}
      {...props}
    />
  ),
);
CardShell.displayName = 'CardShell';
