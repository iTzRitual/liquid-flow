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
        // A distinct disc shade (not surface-muted): otherwise it matches the
        // active shop row's surface-muted highlight and the avatar disappears
        // into it. border-strong is the token earmarked "avatar / divider".
        'inline-flex h-9 w-9 items-center justify-center rounded-full bg-border-strong',
        'font-ui text-[12px] font-semibold text-white',
        className,
      )}
      {...props}
    >
      {toInitials(name)}
    </span>
  );
}
