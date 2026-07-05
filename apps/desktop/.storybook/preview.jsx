import React from 'react';
import '../renderer/src/index.css';

// api.js robi `const api = window.api` na starcie modułu — w Storybooku (bez
// Electrona) window.api nie istnieje, więc podstawiamy atrapę, żeby import
// grafu komponentów się nie wywalił. Realne dane wstrzykuje MockApp przez ctx.
if (typeof window !== 'undefined' && !window.api) {
  window.api = new Proxy({}, { get: () => async () => undefined });
}

// Przełącznik motywu (light/dark) w pasku narzędzi — dokłada/zdejmuje klasę
// `.dark` na <html>, dokładnie jak apka.
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
