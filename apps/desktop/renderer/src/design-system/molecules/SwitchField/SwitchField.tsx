import { Switch } from '../../atoms/Switch';
import { cn } from '../../foundations/cn';

/** Inline switch + label ("Zapamiętaj hasło"). The wrapping label makes the
 * whole row toggle the control. */
export interface SwitchFieldProps {
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

export function SwitchField({ label, className, ...switchProps }: SwitchFieldProps) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-3', className)}>
      <Switch {...switchProps} />
      <span className="font-ui text-[14px] font-medium text-text-primary">{label}</span>
    </label>
  );
}
