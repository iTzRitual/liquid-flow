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
  staticDirs: ['../renderer/public'],

  // We do not inherit the app's vite.config.js (it sets root=renderer, which
  // conflicts with Storybook's own root) — we configure only what the components
  // need: the '@' alias and repo access (deep-import translations.js from core).
  async viteFinal(config) {
    const { mergeConfig } = await import('vite');
    return mergeConfig(config, {
      // The app sets root=renderer in its vite.config — we restore root to the
      // desktop directory, so Storybook manages its own tree.
      root: desktop,
      resolve: { alias: { '@': join(desktop, 'renderer', 'src') } },
      server: { fs: { allow: [repoRoot] } },
    });
  },

  addons: ['@storybook/addon-mcp']
};
