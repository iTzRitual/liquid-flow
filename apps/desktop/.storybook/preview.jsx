import React from 'react';
import '../renderer/src/index.css';

// api.js does `const api = window.api` at module startup — in Storybook (without
// Electron) window.api does not exist, so we substitute a stub so the component
// graph import does not blow up. Real data is injected by MockApp via ctx.
if (typeof window !== 'undefined' && !window.api) {
  window.api = new Proxy({}, { get: () => async () => undefined });
}

// Theme switcher (light/dark) in the toolbar — adds/removes the `.dark` class
// on <html>, exactly like the app.
const withTheme = (Story, ctx) => {
  const dark = ctx.globals.theme === 'dark';
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <div className="bg-background text-foreground" style={{ minHeight: '100vh' }}>
      <Story />
    </div>
  );
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
    layout: 'fullscreen',
    controls: { expanded: true },
  },
};
