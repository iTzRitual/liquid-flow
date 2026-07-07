/**
 * Tailwind config scoped to the NEW design system only. Loaded via the
 * `@config` directive in foundations/theme.css, so the legacy tailwind.config.js
 * and index.css stay completely untouched. Utilities map onto the `--ds-*`
 * custom properties from tokens.css (HSL channels → `hsl(var(--ds-...) / <alpha>)`).
 *
 * `content` is resolved from the desktop workspace dir (Storybook/Vite root).
 */
export default {
  content: ['./renderer/src/design-system/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        interactive: {
          primary: 'hsl(var(--ds-color-interactive-primary) / <alpha-value>)',
          'primary-fg': 'hsl(var(--ds-color-interactive-primary-fg) / <alpha-value>)',
        },
        feedback: {
          success: 'hsl(var(--ds-color-feedback-success) / <alpha-value>)',
          info: 'hsl(var(--ds-color-feedback-info) / <alpha-value>)',
          warning: 'hsl(var(--ds-color-feedback-warning) / <alpha-value>)',
          error: 'hsl(var(--ds-color-feedback-error) / <alpha-value>)',
        },
        text: {
          primary: 'hsl(var(--ds-color-text-primary) / <alpha-value>)',
          secondary: 'hsl(var(--ds-color-text-secondary) / <alpha-value>)',
          muted: 'hsl(var(--ds-color-text-muted) / <alpha-value>)',
        },
        surface: {
          base: 'hsl(var(--ds-color-surface-base) / <alpha-value>)',
          app: 'hsl(var(--ds-color-surface-app) / <alpha-value>)',
          muted: 'hsl(var(--ds-color-surface-muted) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'hsl(var(--ds-color-border-default) / <alpha-value>)',
          strong: 'hsl(var(--ds-color-border-strong) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Rubik', 'system-ui', 'sans-serif'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--ds-radius-sm)',
        md: 'var(--ds-radius-md)',
        lg: 'var(--ds-radius-lg)',
        xl: 'var(--ds-radius-xl)',
        '2xl': 'var(--ds-radius-2xl)',
      },
      boxShadow: {
        sm: 'var(--ds-shadow-sm)',
        md: 'var(--ds-shadow-md)',
        lg: 'var(--ds-shadow-lg)',
      },
    },
  },
  plugins: [],
};
