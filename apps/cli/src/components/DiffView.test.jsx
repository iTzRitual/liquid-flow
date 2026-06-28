import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { translationsFor } from '@liquidflow/core';
import DiffView from './DiffView.jsx';
import { keys, press, frame } from '../../../../test/helpers/ink.js';

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
    // 20 linii diff, maxRows=5 — powinny pojawić się wskaźniki po przewinięciu
    const diff = Array.from({ length: 20 }, (_, i) => ({ type: 'ctx', line: `linia ${i + 1}` }));
    const api = render(
      <DiffView title="long.liquid" preview={textPreview(diff)} onCancel={vi.fn()} maxRows={5} t={t} />
    );
    // przy scroll=0 powinny być widoczne pierwsze linie
    expect(frame(api)).toContain('linia 1');
    // przewiń w dół — pojawią się kolejne linie
    await press(api.stdin, keys.down);
    expect(frame(api)).toContain('linia 2');
  });
});
