import * as React from 'react';

/**
 * True once the window's inner height is at or below `maxHeight`, reactive to
 * resizes. The onboarding marketing column uses it to collapse its feature list
 * into a single rotating item on short windows, so the panel stays readable down
 * to the app's 600px minimum window height.
 */
export function useIsCompactWindow(maxHeight: number): boolean {
  const [height, setHeight] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : maxHeight + 1,
  );

  React.useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return height <= maxHeight;
}
