import * as React from 'react';
import { cn } from '../../foundations/cn';

/** Single-line text input matching the Figma form fields (white, slate-300 border, radius 6). */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-surface-base px-3',
        'font-ui text-[14px] leading-5 text-text-primary placeholder:text-text-muted',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-interactive-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
