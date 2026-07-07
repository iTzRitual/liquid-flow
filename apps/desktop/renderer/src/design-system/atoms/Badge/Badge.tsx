import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../foundations/cn';

/**
 * Small status pill from the Hub header. Variants: `neutral` (dark "ID 3"),
 * `success` (filled green "Połączono"), `successSoft` (green outline for
 * "Brak konfliktów", pairs with a Check icon child), `warning`.
 */
const badge = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-display text-[10px] leading-3',
  {
    variants: {
      variant: {
        neutral: 'bg-text-primary text-surface-base',
        success: 'bg-feedback-success text-surface-base',
        successSoft: 'border border-feedback-success text-feedback-success',
        warning: 'bg-feedback-warning text-surface-base',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
}

export { badge as badgeVariants };
