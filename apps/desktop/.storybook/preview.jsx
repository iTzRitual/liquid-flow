import React from 'react';
import '../renderer/src/index.css';

// api.js does `const api = window.api` at module startup — in Storybook (without
// Electron) window.api does not exist, so we substitute a stub so the component
// graph import does not blow up. Real data is injected by MockApp via ctx.
if (typeof window !== 'undefined' && !window.api) {
  window.api = new Proxy({}, { get: () => async () => undefined });
}

// Theme switcher (light/dark) in the toolbar — adds/removes the `.dark` class
// on <html>, exactly like the app. Theme classes go on <body> (not a wrapper
// div) so the canvas background is correct under both the 'centered' layout
// (small components, letterboxed) and 'fullscreen' layout (whole screens) —
// a wrapper div with a forced height would otherwise defeat Storybook's own
// centering for the former.
const withTheme = (Story, ctx) => {
  const dark = ctx.globals.theme === 'dark';
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.add('bg-background', 'text-foreground');
  }, [dark]);
  return <Story />;
};

/** @type {import('@storybook/react-vite').Preview} */
export default {
  globalTypes: {
    theme: {
      description: 'Motyw',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
  parameters: {
    // Small isolated components look best centered in the canvas; full
    // screens (Onboarding, WindowChrome) override this to 'fullscreen'
    // per-story since they manage their own viewport-filling layout.
    layout: 'centered',
    controls: { expanded: true },
  },
};
