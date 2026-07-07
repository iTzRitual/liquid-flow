import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../foundations/cn';

/**
 * Typographic atom. `variant` maps 1:1 to the type roles extracted from Figma
 * (Rubik for display/headings, Inter for UI/body). Polymorphic via `as`, so the
 * right HTML element and the visual style stay independent.
 */
const text = cva('', {
  variants: {
    variant: {
      'display-2xl': 'font-display text-[48px] font-black leading-none',
      'heading-xl': 'font-display text-[30px] font-semibold leading-9',
      'heading-lg': 'font-display text-[24px] font-semibold leading-8',
      'heading-md': 'font-display text-[16px] font-semibold leading-6',
      'body-md': 'font-display text-[13px] leading-[18px]',
      'body-sm': 'font-display text-[12px] leading-6',
      'label-md': 'font-ui text-[14px] font-medium leading-5',
      'caption-md': 'font-ui text-[12px] leading-[14px]',
      'badge-xs': 'font-display text-[10px] leading-3',
    },
    tone: {
      primary: 'text-text-primary',
      secondary: 'text-text-secondary',
      muted: 'text-text-muted',
    },
  },
  defaultVariants: { variant: 'body-md', tone: 'primary' },
});

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof text> {
  as?: React.ElementType;
}

export function Text({ as: Comp = 'span', variant, tone, className, ...props }: TextProps) {
  return <Comp className={cn(text({ variant, tone }), className)} {...props} />;
}

export { text as textVariants };
