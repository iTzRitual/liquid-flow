import { FeatureItem, type FeatureItemProps } from '../../molecules/FeatureItem';
import { cn } from '../../foundations/cn';

export type Feature = FeatureItemProps;

/** The onboarding feature column: a vertical stack of icon + title + description
 * rows. Purely presentational — the caller supplies the features. */
export interface FeatureListProps {
  features: Feature[];
  className?: string;
}

export function FeatureList({ features, className }: FeatureListProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {features.map((feature) => (
        <FeatureItem key={feature.title} {...feature} />
      ))}
    </div>
  );
}
