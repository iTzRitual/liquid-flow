import { Switch as BaseSwitch } from '@base-ui-components/react/switch';
import { cn } from '../../foundations/cn';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  id?: string;
  className?: string;
}

/**
 * Toggle built on Base UI's Switch primitive (accessible role=switch, keyboard
 * support, hidden form input). The track flips to the dark on-state from the
 * Figma onboarding toggle; the thumb slides via the `data-checked` attribute
 * Base UI sets on the root.
 */
export function Switch({ className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      onCheckedChange={onCheckedChange ? (checked) => onCheckedChange(checked) : undefined}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'bg-border-strong data-[checked]:bg-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive-primary',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          'block h-5 w-5 translate-x-0.5 rounded-full bg-surface-base shadow-sm',
          'transition-transform data-[checked]:translate-x-[22px]',
        )}
      />
    </BaseSwitch.Root>
  );
}
