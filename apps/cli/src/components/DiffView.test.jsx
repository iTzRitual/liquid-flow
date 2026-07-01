import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import DiffView from './DiffView.jsx';
import { keys, press, frame, renderFrame } from '../../../../test/helpers/ink.js';

const t = translationsFor('pl');

const textPreview = (diffLines) => ({
  kind: 'text',
  local: 'a',
  remote: 'b',
  diff: diffLines,
});

describe('DiffView — warianty podglądu', () => {
  it('plik binarny — pokazuje komunikat DiffBinary', () => {
    const api = render(
      <DiffView title="logo.png" preview={{ kind: 'binary', side: 'both' }} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    expect(frame(api)).toContain(t.DiffBinary);
  });

  it('plik za duży — pokazuje komunikat DiffTooLarge', () => {
    const api = render(
      <DiffView title="huge.liquid" preview={{ kind: 'tooLarge' }} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    expect(frame(api)).toContain(t.DiffTooLarge);
  });

  it('tooLarge z długim tytułem w wąskim oknie — tytuł nie zawija, render mieści się w budżecie', async () => {
    const longTitle = 'Podgląd: order/delivery-partials/very/deep/path/desktop1.min.css';
    const lines = await renderFrame(
      <DiffView title={longTitle} preview={{ kind: 'tooLarge' }} onCancel={vi.fn()} maxRows={8} t={t} />, 40
    );
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.join('\n')).toContain(t.DiffTooLarge);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(40);
  });

  it('binary z długim tytułem w wąskim oknie — tytuł nie zawija, render mieści się w budżecie', async () => {
    const longTitle = 'Podgląd: order/delivery-partials/very/deep/path/desktop1.min.css';
    const lines = await renderFrame(
      <DiffView title={longTitle} preview={{ kind: 'binary', side: 'both' }} onCancel={vi.fn()} maxRows={8} t={t} />, 40
    );
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.join('\n')).toContain(t.DiffBinary);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(40);
  });

  it('diff tekstowy — linie del/add/ctx renderowane z prefixami', () => {
    const diff = [
      { type: 'del', line: 'stara linia' },
      { type: 'add', line: 'nowa linia' },
      { type: 'ctx', line: 'kontekst' },
    ];
    const api = render(
      <DiffView title="test.liquid" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    const f = frame(api);
    expect(f).toContain('- stara linia');
    expect(f).toContain('+ nowa linia');
    expect(f).toContain('  kontekst');
  });

  it('diff bez zmian → summary "Brak różnic"', () => {
    const diff = [{ type: 'ctx', line: 'ta sama linia' }];
    const api = render(
      <DiffView title="same.liquid" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    expect(frame(api)).toContain(t.DiffNoChanges);
  });

  it('identical:true → summary DiffIdentical (nie DiffNoChanges)', () => {
    const diff = [{ type: 'ctx', line: 'ta sama linia' }];
    const api = render(
      <DiffView title="same.liquid" preview={{ ...textPreview(diff), identical: true }} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    const f = frame(api);
    expect(f).toContain(t.DiffIdentical);
  });

  it('summary z dodanymi i usuniętymi → DiffSummary (nie DiffNoChanges)', () => {
    const diff = [
      { type: 'del', line: 'x' },
      { type: 'add', line: 'y' },
    ];
    const api = render(
      <DiffView title="changed.liquid" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    const f = frame(api);
    expect(f).not.toContain(t.DiffNoChanges);
    expect(f).toContain('+1');
  });
});

describe('DiffView — nawigacja', () => {
  it('Esc wywołuje onCancel', async () => {
    const onCancel = vi.fn();
    const diff = [{ type: 'ctx', line: 'x' }];
    const api = render(
      <DiffView title="test" preview={textPreview(diff)} onCancel={onCancel} maxRows={8} t={t} />
    );
    await press(api.stdin, keys.escape);
    expect(onCancel).toHaveBeenCalled();
  });

  it('↑/↓ przewija widoczne linie', async () => {
    // 20 ZMIENIONych linii (add) — wszystkie zachowane (bez zwijania), maxRows=5
    const diff = Array.from({ length: 20 }, (_, i) => ({ type: 'add', line: `linia ${i + 1}` }));
    const api = render(
      <DiffView title="long.liquid" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={5} t={t} />
    );
    // przy scroll=0 powinny być widoczne pierwsze linie
    expect(frame(api)).toContain('linia 1');
    // przewiń w dół — pojawią się kolejne linie
    await press(api.stdin, keys.down);
    expect(frame(api)).toContain('linia 2');
  });

  it('numer linii w rynnie + zwijanie długiego kontekstu', () => {
    // 1 zmiana, potem dużo kontekstu → fold „N niezmienionych wierszy"
    const diff = [{ type: 'add', line: 'zmieniona' }];
    for (let i = 0; i < 10; i++) diff.push({ type: 'ctx', line: `ctx ${i}` });
    const api = render(
      <DiffView title="big.liquid" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={12} t={t} />
    );
    const f = frame(api);
    expect(f).toContain('+ zmieniona');
    expect(f).toMatch(/1 \+ zmieniona/); // numer linii w rynnie
    expect(f).toContain('niezmienionych wierszy'); // fold widoczny
  });

  it('głęboko zagnieżdżone (taby) → dedent i ekspansja, bez surowego \\t', () => {
    const diff = [
      { type: 'del', line: '\t\t\t<div>old</div>' },
      { type: 'add', line: '\t\t\t<div>new</div>' },
    ];
    const api = render(
      <DiffView title="nested.liquid" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={8} t={t} />
    );
    const f = frame(api);
    expect(f).not.toContain('\t'); // żadnych surowych tabów
    // wspólne wcięcie odcięte → treść lgnie do prefixu (bez 6 spacji wiodących)
    expect(f).toContain('- <div>old</div>');
    expect(f).toContain('+ <div>new</div>');
  });

  it('usuwa znaki sterujące (CR z plików CRLF) — render się nie rozsypuje', () => {
    // linie z końcowym \r — w terminalu \r przesuwa kursor na początek wiersza i
    // rozbija kadr (był to główny bug). Sanityzacja musi je usunąć.
    const diff = [
      { type: 'del', line: 'stara\r' },
      { type: 'add', line: 'nowa\r' },
    ];
    const raw = render(
      <DiffView title="crlf.html" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={8} t={t} />
    ).lastFrame();
    expect(raw).not.toContain('\r'); // żaden carriage return nie przeciekł do renderu
    expect(raw).not.toContain('\x07'); // ani inny znak sterujący z treści
    const f = frame({ lastFrame: () => raw });
    expect(f).toContain('- stara');
    expect(f).toContain('+ nowa');
  });
});
