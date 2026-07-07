import type { Transition, Variants } from 'motion/react';

/*
 * Shared Framer Motion (package `motion`, v12) presets. Centralising easing and
 * common variants keeps animation consistent and makes Motion the single source
 * of movement for the design system.
 */

/** Standard ease/duration for most UI transitions. */
export const easeStandard: Transition = { duration: 0.2, ease: [0.4, 0, 0.2, 1] };

/** Fade + small upward move — panels, cards, list items entering. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: easeStandard },
};

/** Container that staggers its children's `show` state. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
