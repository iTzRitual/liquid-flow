import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../foundations/cn';

/**
 * Colored status dot — the log-entry indicator from the Hub (success/info/
 * warning) and reusable wherever a compact state marker is needed.
 */
const dot = cva('inline-block shrink-0 rounded-full', {
  variants: {
    tone: {
      success: 'bg-feedback-success',
      info: 'bg-feedback-info',
      warning: 'bg-feedback-warning',
      error: 'bg-feedback-error',
      neutral: 'bg-text-muted',
    },
    size: { sm: 'h-2 w-2', md: 'h-2.5 w-2.5' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});

export interface StatusDotProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof dot> {}

export function StatusDot({ className, tone, size, ...props }: StatusDotProps) {
  return <span role="presentation" className={cn(dot({ tone, size }), className)} {...props} />;
}

export { dot as statusDotVariants };
