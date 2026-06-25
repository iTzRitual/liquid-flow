import { describe, it, expect } from 'vitest';
import { translationsFor, tfmt, localeFor, LANGUAGES, LOCALES } from './translations.js';

const pl = translationsFor('pl');
const en = translationsFor('en');

describe('tfmt', () => {
  it('podstawia tokeny {nazwa}', () => {
    expect(tfmt('Cześć {name}, masz {n} plików', { name: 'Ala', n: 3 }))
      .toBe('Cześć Ala, masz 3 plików');
  });
  it('nieznany token zostaje nietknięty', () => {
    expect(tfmt('a {x} b', {})).toBe('a {x} b');
  });
  it('null/undefined → pusty string', () => {
    expect(tfmt(null)).toBe('');
  });
});

describe('parytet kluczy PL/EN', () => {
  it('każdy klucz PL ma odpowiednik EN i odwrotnie', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pl).sort());
  });

  it('brak nieprzetłumaczonych: en===pl tam, gdzie PL ma polskie znaki', () => {
    const polishChar = /[ąćęłńóśźż]/i;
    const untranslated = Object.keys(pl).filter(
      (k) => en[k] === pl[k] && polishChar.test(pl[k])
    );
    expect(untranslated, `nieprzetłumaczone klucze: ${untranslated.join(', ')}`).toEqual([]);
  });

  it('tokeny {…} zgadzają się między PL a EN dla każdego klucza', () => {
    const tokens = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort();
    const mismatched = Object.keys(pl).filter(
      (k) => tokens(pl[k]).join(',') !== tokens(en[k]).join(',')
    );
    expect(mismatched, `rozjazd tokenów: ${mismatched.join(', ')}`).toEqual([]);
  });
});

describe('meta', () => {
  it('LANGUAGES i LOCALES obejmują pl i en', () => {
    const codes = LANGUAGES.map((l) => l.Id);
    expect(codes).toContain('pl');
    expect(codes).toContain('en');
    expect(localeFor('pl')).toBe(LOCALES.pl);
    expect(localeFor('en')).toBe(LOCALES.en);
  });

  it('nieznany język → fallback PL', () => {
    expect(translationsFor('xx')).toBe(pl);
  });
});
