import * as React from 'react';
import { cn } from '../../foundations/cn';

/** The onboarding split layout: a plain marketing column on the left (brand,
 * tagline, feature list) and a form region on the right. Pure structural layout.
 * The marketing column is a shrink-to-fit half that hides below `md`, so on
 * narrow windows the form takes the full width. The right slot is meant to hold
 * a `ContentSurface` (the framed, full-height content card). */
export interface SplitMarketingFormProps {
  marketing: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SplitMarketingForm({ marketing, children, className }: SplitMarketingFormProps) {
  return (
    <div className={cn('flex h-full overflow-hidden bg-surface-app', className)}>
      <div className="hidden shrink-0 overflow-hidden p-10 md:flex md:max-w-[50%]">
        <div className="flex h-full w-full max-w-md flex-col justify-center gap-8">{marketing}</div>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
