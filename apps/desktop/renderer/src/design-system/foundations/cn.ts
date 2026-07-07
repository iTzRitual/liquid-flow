import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with conditional logic (clsx) and Tailwind conflict
 * resolution (tailwind-merge). The single class helper for the design system —
 * deliberately new, so nothing here depends on the legacy `lib/utils`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
