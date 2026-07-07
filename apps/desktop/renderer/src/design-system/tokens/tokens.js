/*
 * Structured mirror of tokens.css — drives the "Design System/Tokens" story so
 * the visual reference and the CSS stay describable from one place. `source` is
 * 'F' (extracted from Figma) or 'P' (proposal / gap). `hex` is for labels only;
 * the swatches render from the live CSS var so they always reflect tokens.css.
 */

export const FONT_DISPLAY = "'Rubik', system-ui, sans-serif";
export const FONT_UI = "'Inter', system-ui, sans-serif";

/** Decided semantic colors (interactive + feedback). */
export const semanticColors = [
  { name: 'interactive.primary', var: '--ds-color-interactive-primary', hex: '#3365ff', source: 'F', usage: 'Primary action button, "Flow" wordmark' },
  { name: 'interactive.primary.fg', var: '--ds-color-interactive-primary-fg', hex: '#ffffff', source: 'F', usage: 'Text on primary button' },
  { name: 'feedback.success', var: '--ds-color-feedback-success', hex: '#61c354', source: 'F', usage: 'Connected, no-conflicts, file-changed dot' },
  { name: 'feedback.info', var: '--ds-color-feedback-info', hex: '#549ac3', source: 'F', usage: 'Git checkpoint log dot' },
  { name: 'feedback.warning', var: '--ds-color-feedback-warning', hex: '#c39e54', source: 'F', usage: 'Conflict-check log dot' },
  { name: 'feedback.error', var: '--ds-color-feedback-error', hex: '#e5484d', source: 'P', usage: 'Danger — no error color in Figma (proposal)' },
];

/** Neutral ramp candidates — shown side by side; one is chosen in KROK 0. */
export const rampWarm = [
  { name: 'warm.900', var: '--ds-warm-900', hex: '#121212', source: 'F', usage: 'Primary text (dominant in Figma)' },
  { name: 'warm.700', var: '--ds-warm-700', hex: '#4a4a4a', source: 'F', usage: 'Secondary text / timestamps' },
  { name: 'warm.500', var: '--ds-warm-500', hex: '#909090', source: 'F', usage: 'Muted ("lub" divider)' },
];
export const rampSlate = [
  { name: 'slate.900', var: '--ds-slate-900', hex: '#0f172a', source: 'F', usage: 'Primary text (onboarding form)' },
  { name: 'slate.500', var: '--ds-slate-500', hex: '#64748b', source: 'F', usage: 'Secondary text' },
  { name: 'slate.400', var: '--ds-slate-400', hex: '#94a3b8', source: 'F', usage: 'Muted / placeholder' },
  { name: 'slate.300', var: '--ds-slate-300', hex: '#cbd5e1', source: 'F', usage: 'Input border' },
];

/** Surfaces & borders (ramp-independent). */
export const surfaces = [
  { name: 'surface.base', var: '--ds-white', hex: '#ffffff', source: 'F', usage: 'Cards / panels' },
  { name: 'surface.app', var: '--ds-neutral-app', hex: '#f0f0f0', source: 'F', usage: 'App background / sidebar' },
  { name: 'surface.muted', var: '--ds-neutral-muted', hex: '#e7e7e7', source: 'F', usage: 'Selected row / subtle border' },
  { name: 'border.strong', var: '--ds-neutral-line', hex: '#d9d9d9', source: 'F', usage: 'Avatar / divider' },
];

/** Type scale — each role maps a real Figma text combination. */
export const typography = [
  { name: 'display.2xl', font: FONT_DISPLAY, size: 48, lh: 48, weight: 900, label: 'Rubik Black', sample: 'Liquid Flow', source: 'F', usage: 'Wordmark (brand only)' },
  { name: 'heading.xl', font: FONT_DISPLAY, size: 30, lh: 36, weight: 600, label: 'Rubik SemiBold', sample: 'Dodaj swój pierwszy sklep', source: 'F', usage: 'Page title' },
  { name: 'heading.lg', font: FONT_DISPLAY, size: 24, lh: 32, weight: 600, label: 'Rubik SemiBold', sample: 'Zaawansowane środowisko desktopowe', source: 'F', usage: 'Section headline' },
  { name: 'heading.md', font: FONT_DISPLAY, size: 16, lh: 24, weight: 600, label: 'Rubik SemiBold', sample: 'Live Logging', source: 'F', usage: 'Card / feature title' },
  { name: 'body.md', font: FONT_DISPLAY, size: 13, lh: 18, weight: 400, label: 'Rubik Regular', sample: 'Topaz 2024.10.2', source: 'F', usage: 'Lists, shop/template names' },
  { name: 'body.sm', font: FONT_DISPLAY, size: 12, lh: 24, weight: 400, label: 'Rubik Regular', sample: 'Podgląd procesów synchronizacji w czasie rzeczywistym.', source: 'F', usage: 'Descriptions' },
  { name: 'label.md', font: FONT_UI, size: 14, lh: 20, weight: 500, label: 'Inter Medium', sample: 'Nazwa sklepu', source: 'F', usage: 'Form labels' },
  { name: 'input.md', font: FONT_UI, size: 14, lh: 20, weight: 400, label: 'Inter Regular', sample: 'https://', source: 'F', usage: 'Input text / placeholder' },
  { name: 'button.md', font: FONT_UI, size: 14, lh: 20, weight: 500, label: 'Inter Medium', sample: 'Dodaj i zaloguj', source: 'F', usage: 'Button labels (lh normalized)' },
  { name: 'caption.md', font: FONT_UI, size: 12, lh: 14, weight: 400, label: 'Inter Regular', sample: '12:03:21  Plik został zmieniony', source: 'F', usage: 'Log timestamps / entries' },
  { name: 'badge.xs', font: FONT_DISPLAY, size: 10, lh: 12, weight: 400, label: 'Rubik Regular', sample: 'Połączono', source: 'F', usage: 'Status badge' },
  { name: 'label.sm', font: FONT_UI, size: 14, lh: 14, weight: 500, label: 'Inter Medium', sample: 'Zapamiętaj hasło', source: 'F', usage: 'Inline label' },
];

/** Spacing scale (px). */
export const spacing = [
  { name: '2xs', var: '--ds-space-2xs', px: 4, source: 'P' },
  { name: 'xs', var: '--ds-space-xs', px: 6, source: 'F' },
  { name: 'sm', var: '--ds-space-sm', px: 8, source: 'F' },
  { name: 'md', var: '--ds-space-md', px: 12, source: 'F', note: 'base' },
  { name: 'lg', var: '--ds-space-lg', px: 16, source: 'F' },
  { name: 'xl', var: '--ds-space-xl', px: 20, source: 'F' },
  { name: '2xl', var: '--ds-space-2xl', px: 24, source: 'F' },
  { name: '3xl', var: '--ds-space-3xl', px: 40, source: 'F' },
  { name: '4xl', var: '--ds-space-4xl', px: 56, source: 'F' },
];

/** Radius scale (px). */
export const radius = [
  { name: 'sm', var: '--ds-radius-sm', px: 4, source: 'F' },
  { name: 'md', var: '--ds-radius-md', px: 6, source: 'F', note: 'inputs / buttons' },
  { name: 'lg', var: '--ds-radius-lg', px: 8, source: 'F' },
  { name: 'xl', var: '--ds-radius-xl', px: 12, source: 'F' },
  { name: '2xl', var: '--ds-radius-2xl', px: 16, source: 'F' },
  { name: 'full', var: '--ds-radius-full', px: 9999, source: 'F', note: 'pills / avatars' },
];

/** Elevation scale — [P], effects not present in the Figma export. */
export const shadows = [
  { name: 'sm', var: '--ds-shadow-sm', source: 'P' },
  { name: 'md', var: '--ds-shadow-md', source: 'P' },
  { name: 'lg', var: '--ds-shadow-lg', source: 'P' },
];
