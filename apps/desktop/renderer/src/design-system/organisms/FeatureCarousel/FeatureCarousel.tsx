import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FeatureItem } from '../../molecules/FeatureItem';
import { FeatureList, type Feature } from '../FeatureList';
import { useIsCompactWindow } from '../../foundations/useIsCompactWindow';
import { cn } from '../../foundations/cn';

// Below this window height the onboarding marketing column (wordmark + tagline +
// preview image + three feature rows) stops fitting without the column's
// overflow clipping it. Past that point the full list collapses to a single
// item that rotates, keeping the panel readable down to the app's 600px minimum
// window height.
const COMPACT_MAX_HEIGHT = 750;
const ROTATE_MS = 3000;

/** The onboarding feature column: a vertical stack of icon + title + description
 * rows on tall windows, collapsing to one auto-rotating row on short ones.
 * `compact` forces that collapsed mode (stories/tests); when omitted it derives
 * from the window height. */
export interface FeatureCarouselProps {
  features: Feature[];
  compact?: boolean;
  className?: string;
}

export function FeatureCarousel({ features, compact, className }: FeatureCarouselProps) {
  const auto = useIsCompactWindow(COMPACT_MAX_HEIGHT);
  const isCompact = compact ?? auto;
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (!isCompact) return;
    setIndex(0);
    const id = setInterval(() => setIndex((i) => (i + 1) % features.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [isCompact, features.length]);

  if (!isCompact) {
    return <FeatureList features={features} className={className} />;
  }

  const active = features[index];
  return (
    <div className={cn('relative', className)}>
      {/* Invisible sizer: every item shares the same grid cell so the container
          takes the tallest item's height, keeping the rotation from shifting the
          surrounding layout as one- and two-line descriptions swap in. */}
      <div className="invisible grid" aria-hidden="true">
        {features.map((feature) => (
          <div key={feature.title} className="col-start-1 row-start-1">
            <FeatureItem {...feature} />
          </div>
        ))}
      </div>

      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <FeatureItem {...active} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
