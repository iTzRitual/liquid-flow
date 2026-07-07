import { cn } from '../../foundations/cn';

/** Horizontal rule with a centered label — the onboarding "lub" separator. */
export interface OrDividerProps {
  label?: string;
  className?: string;
}

export function OrDivider({ label = 'lub', className }: OrDividerProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-border" />
      <span className="font-ui text-[14px] font-medium text-text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
