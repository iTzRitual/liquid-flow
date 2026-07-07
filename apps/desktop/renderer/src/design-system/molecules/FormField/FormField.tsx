import * as React from 'react';
import { Label } from '../../atoms/Label';
import { Text } from '../../atoms/Text';
import { cn } from '../../foundations/cn';

/**
 * Label + control + optional hint/error, stacked. The control is passed as
 * children (Input, password field, …) so the molecule stays agnostic; wire
 * `htmlFor` to the control's `id` for accessibility. `error` takes precedence
 * over `hint`.
 */
export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, hint, error, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <Text as="p" variant="caption-md" className="text-feedback-error">
          {error}
        </Text>
      ) : hint ? (
        <Text as="p" variant="caption-md" tone="muted">
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
