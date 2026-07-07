import type { LucideIcon } from '../../foundations/icons';
import { Text } from '../../atoms/Text';
import { cn } from '../../foundations/cn';

/** Icon + title + description row from the onboarding feature list. */
export interface FeatureItemProps {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}

export function FeatureItem({ icon: Icon, title, description, className }: FeatureItemProps) {
  return (
    <div className={cn('flex gap-3', className)}>
      <Icon className="h-5 w-5 shrink-0 text-text-primary" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <Text as="div" variant="heading-md">{title}</Text>
        <Text as="p" variant="body-sm" tone="secondary">{description}</Text>
      </div>
    </div>
  );
}
