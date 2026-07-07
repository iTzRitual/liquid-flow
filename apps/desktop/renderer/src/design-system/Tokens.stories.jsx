import React from 'react';
import './tokens/tokens.css';
import {
  semanticColors, rampWarm, rampSlate, surfaces,
  typography, spacing, radius, shadows,
} from './tokens/tokens.js';

/*
 * Living reference for the design tokens. Intentionally self-contained: every
 * style here is an inline style reading a `--ds-*` custom property directly, so
 * the page depends on tokens.css ONLY — no Tailwind utilities, no legacy CSS.
 */

export default {
  title: 'Design System/Tokens',
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
};

const c = (v) => `hsl(var(${v}))`;

const S = {
  page: {
    minHeight: '100vh',
    background: c('--ds-color-surface-app'),
    color: c('--ds-color-text-primary'),
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: 40,
    boxSizing: 'border-box',
  },
  h1: { fontFamily: "'Rubik', sans-serif", fontSize: 30, fontWeight: 600, margin: '0 0 4px' },
  lead: { fontSize: 14, color: c('--ds-color-text-secondary'), margin: '0 0 28px' },
  h2: { fontFamily: "'Rubik', sans-serif", fontSize: 20, fontWeight: 600, margin: '32px 0 14px' },
  card: {
    background: c('--ds-color-surface-base'),
    border: `1px solid ${c('--ds-color-border-default')}`,
    borderRadius: 12,
    padding: 20,
  },
  grid: (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 16 }),
  chip: (src) => ({
    fontSize: 10, fontWeight: 600, letterSpacing: 0.4, padding: '1px 6px', borderRadius: 9999,
    background: src === 'F' ? c('--ds-color-feedback-success') : c('--ds-color-feedback-warning'),
    color: '#fff', display: 'inline-block',
  }),
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 },
};

const Chip = ({ source }) => (
  <span style={S.chip(source)}>{source === 'F' ? 'FIGMA' : 'PROPOZYCJA'}</span>
);

function Swatch({ token }) {
  return (
    <div style={S.card}>
      <div style={{
        height: 64, borderRadius: 8, background: c(token.var),
        border: `1px solid ${c('--ds-color-border-default')}`,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <strong style={{ fontSize: 13 }}>{token.name}</strong>
        <Chip source={token.source} />
      </div>
      <div style={{ ...S.mono, marginTop: 4, color: c('--ds-color-text-secondary') }}>{token.hex}</div>
      <div style={{ fontSize: 12, color: c('--ds-color-text-muted'), marginTop: 6 }}>{token.usage}</div>
    </div>
  );
}

/* ---- Colors --------------------------------------------------------- */
export const Colors = () => (
  <div style={S.page}>
    <h1 style={S.h1}>Kolory — semantyczne</h1>
    <p style={S.lead}>Interaktywne, feedback i powierzchnie. Zielona plakietka = z Figmy, pomarańczowa = propozycja do akceptacji.</p>

    <h2 style={S.h2}>Interactive &amp; Feedback</h2>
    <div style={S.grid(220)}>{semanticColors.map((t) => <Swatch key={t.name} token={t} />)}</div>

    <h2 style={S.h2}>Surfaces &amp; Borders</h2>
    <div style={S.grid(220)}>{surfaces.map((t) => <Swatch key={t.name} token={t} />)}</div>
  </div>
);

/* ---- Neutrals: ramp A vs ramp B ------------------------------------- */
function RampColumn({ title, ramp, note }) {
  return (
    <div style={{ ...S.card, flex: 1 }}>
      <h3 style={{ fontFamily: "'Rubik', sans-serif", fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>{title}</h3>
      <p style={{ fontSize: 12, color: c('--ds-color-text-muted'), margin: '0 0 16px' }}>{note}</p>
      {ramp.map((t) => (
        <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: c(t.var), border: `1px solid ${c('--ds-color-border-default')}` }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
            <div style={{ ...S.mono, color: c('--ds-color-text-secondary') }}>{t.hex}</div>
            <div style={{ fontSize: 11, color: c('--ds-color-text-muted') }}>{t.usage}</div>
          </div>
        </div>
      ))}
      {/* Live text preview on a white card, driven by this ramp's own values */}
      <div style={{ marginTop: 16, background: c('--ds-white'), border: `1px solid ${c('--ds-color-border-default')}`, borderRadius: 8, padding: 16 }}>
        <div style={{ color: c(ramp[0].var), fontSize: 16, fontWeight: 600 }}>Nazwa sklepu (primary)</div>
        <div style={{ color: c(ramp[1].var), fontSize: 14, marginTop: 4 }}>ogrodekdziadunia.pl (secondary)</div>
        <div style={{ color: c(ramp[2].var), fontSize: 13, marginTop: 4 }}>Wprowadź dowolną nazwę (muted)</div>
      </div>
    </div>
  );
}

export const Neutrals = () => (
  <div style={S.page}>
    <h1 style={S.h1}>Neutralne — do wyboru: A czy B</h1>
    <p style={S.lead}>W Figmie neutralne istnieją w dwóch rampach. Wybierz jedną — na niej oprę <code style={S.mono}>color.text.* / surface.* / border.*</code>. Podgląd tekstu u dołu każdej kolumny pokazuje realny kontrast na białej karcie.</p>
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <RampColumn title="Ramp A — Warm (odrzucony)" ramp={rampWarm} note="#121212 / #4a4a4a / #909090 — dominuje w tekście designu" />
      <RampColumn title="Ramp B — Slate (wybrany)" ramp={rampSlate} note="#0f172a / #64748b / #94a3b8 — Tailwind slate, baza color.text/surface/border" />
    </div>
  </div>
);

/* ---- Typography ----------------------------------------------------- */
export const Typography = () => (
  <div style={S.page}>
    <h1 style={S.h1}>Typografia</h1>
    <p style={S.lead}>Dwa kroje: Rubik (nagłówki / marka) i Inter (UI / body / etykiety).</p>
    <div style={S.card}>
      {typography.map((t) => (
        <div key={t.name} style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '14px 0', borderBottom: `1px solid ${c('--ds-color-surface-muted')}` }}>
          <div style={{ width: 170, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
            <div style={{ ...S.mono, color: c('--ds-color-text-muted') }}>{t.label} · {t.size}/{t.lh}</div>
            <div style={{ fontSize: 11, color: c('--ds-color-text-muted'), marginTop: 2 }}>{t.usage}</div>
          </div>
          <div style={{ fontFamily: t.font, fontSize: t.size, lineHeight: `${t.lh}px`, fontWeight: t.weight, color: c('--ds-color-text-primary'), minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.sample}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ---- Spacing -------------------------------------------------------- */
export const Spacing = () => (
  <div style={S.page}>
    <h1 style={S.h1}>Spacing</h1>
    <p style={S.lead}>Skala z paddingów Figmy (base = 12). <code style={S.mono}>2xs</code> to propozycja dla ciągłości skali.</p>
    <div style={S.card}>
      {spacing.map((t) => (
        <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
          <div style={{ width: 90, flexShrink: 0 }}>
            <strong style={{ fontSize: 13 }}>{t.name}</strong> <Chip source={t.source} />
          </div>
          <div style={{ ...S.mono, width: 60, color: c('--ds-color-text-secondary') }}>{t.px}px</div>
          <div style={{ height: 16, width: t.px, background: c('--ds-color-interactive-primary'), borderRadius: 3 }} />
          {t.note && <span style={{ fontSize: 11, color: c('--ds-color-text-muted') }}>{t.note}</span>}
        </div>
      ))}
    </div>
  </div>
);

/* ---- Radius --------------------------------------------------------- */
export const Radius = () => (
  <div style={S.page}>
    <h1 style={S.h1}>Radius</h1>
    <div style={S.grid(150)}>
      {radius.map((t) => (
        <div key={t.name} style={S.card}>
          <div style={{ height: 72, background: c('--ds-color-surface-muted'), border: `1px solid ${c('--ds-color-border-default')}`, borderRadius: Math.min(t.px, 36), borderBottomLeftRadius: 0 }} />
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600 }}>radius.{t.name}</div>
          <div style={{ ...S.mono, color: c('--ds-color-text-muted') }}>{t.px === 9999 ? 'full' : `${t.px}px`}{t.note ? ` · ${t.note}` : ''}</div>
        </div>
      ))}
    </div>
  </div>
);

/* ---- Elevation ------------------------------------------------------ */
export const Elevation = () => (
  <div style={S.page}>
    <h1 style={S.h1}>Elevation (shadow)</h1>
    <p style={S.lead}>Propozycja — Figma nie wyeksportowała efektów. Do weryfikacji na węzłach kart/okna.</p>
    <div style={S.grid(200)}>
      {shadows.map((t) => (
        <div key={t.name} style={{ padding: 24 }}>
          <div style={{ height: 96, background: c('--ds-white'), borderRadius: 12, boxShadow: `var(${t.var})` }} />
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>shadow.{t.name} <Chip source={t.source} /></div>
        </div>
      ))}
    </div>
  </div>
);
