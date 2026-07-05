import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const repoRoot = join(desktop, '..', '..');

/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  stories: ['../renderer/src/**/*.stories.@(js|jsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },

  // Nie dziedziczymy vite.config.js apki (ustawia root=renderer, co koliduje
  // z własnym rootem Storybooka) — konfigurujemy tylko to, czego potrzebują
  // komponenty: alias '@' i dostęp do repo (deep-import translations.js z core).
  async viteFinal(config) {
    const { mergeConfig } = await import('vite');
    return mergeConfig(config, {
      // Apka ustawia root=renderer w swoim vite.config — przywracamy root na
      // katalog desktopu, żeby Storybook zarządzał własnym drzewem.
      root: desktop,
      resolve: { alias: { '@': join(desktop, 'renderer', 'src') } },
      server: { fs: { allow: [repoRoot] } },
    });
  },

  addons: ['@storybook/addon-mcp']
};
