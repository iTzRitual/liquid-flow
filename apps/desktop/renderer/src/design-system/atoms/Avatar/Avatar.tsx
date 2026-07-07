import * as React from 'react';
import { cn } from '../../foundations/cn';

/** Derives up to two uppercase initials from a name ("Ogródek Dziadunia" → "OD"). */
function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name?: string;
}

/** Circular initials avatar (the shop avatar in the sidebar). */
export function Avatar({ name = '', className, ...props }: AvatarProps) {
  return (
    <span
      aria-label={name || undefined}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted',
        'font-ui text-[12px] font-medium text-text-secondary',
        className,
      )}
      {...props}
    >
      {toInitials(name)}
    </span>
  );
}
