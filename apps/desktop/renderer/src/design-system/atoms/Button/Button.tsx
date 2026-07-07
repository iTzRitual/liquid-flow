import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../foundations/cn';

/**
 * The primary interactive atom. Variants match the Figma screens: `primary`
 * (the #3365ff action button), `outline` (bordered white button), and `ghost`
 * (icon/label with no chrome, e.g. the "Odśwież" action). Icons are passed as
 * children and spaced via the built-in gap.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'font-ui font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive-primary',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-interactive-primary text-interactive-primary-fg hover:bg-interactive-primary/90',
        outline: 'border border-border bg-surface-base text-text-primary hover:bg-surface-muted',
        ghost: 'text-text-primary hover:bg-surface-muted',
      },
      size: {
        md: 'h-10 px-4 text-[14px] leading-5',
        sm: 'h-8 px-3 text-[13px] leading-5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export { button as buttonVariants };
