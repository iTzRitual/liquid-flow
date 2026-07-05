// Mockowy kontekst apki dla Storybooka (design gallery).
//
// Komponenty desktopu biorą WSZYSTKO (t, api, dane, handlery) przez `useApp()`
// z `AppCtx`. Tu wstrzykujemy atrapę tego kontekstu, dzięki czemu można
// wyrenderować pojedynczy ekran w izolacji, bez Electrona i bez łączenia ze
// sklepem. `t` bierzemy z prawdziwego źródła (deep-import czystego pliku
// translations.js — bez modułów `node:`), żeby teksty PL/EN były realne.
import React from 'react';
import { toast } from 'sonner';
import { AppCtx } from '../App.jsx';
import { translationsFor, LANGUAGES } from '@liquidflow/core/translations.js';

const t = translationsFor('pl');

// Atrapa mostka IPC — każda metoda to async no-op (loguje wywołanie do konsoli).
const api = new Proxy(
  {},
  {
    get(_target, prop) {
      return async (...args) => {
        // eslint-disable-next-line no-console
        console.info(`[mock api] ${String(prop)}`, ...args);
        return undefined;
      };
    },
  },
);

// ————— Fixtures (przykładowe dane do ekranów) —————

export const shops = [
  { Id: 'demo-1', Name: 'Sklep Demo', Url: 'https://demo.comarch.pl/sklep', SavePassword: true },
  { Id: 'demo-2', Name: 'Topaz Testowy', Url: 'https://topaz.example.com', SavePassword: false },
];

export const currentShop = shops[0];
export const currentTemplate = { Id: '42', Name: 'Topaz — Główny' };

// Uwaga: `File` to OBIEKT { Mode, Name } (nie string) — komponenty kluczują i
// wyświetlają wiersze jako `Mode/Name`.
export const mismatches = [
  { File: { Mode: '0', Name: 'templates/index.liquid' }, Type: 'Timestamp', FileTs: 1751000000000, LocalTs: 1751700000000, RemoteTs: 1751600000000 },
  { File: { Mode: '0', Name: 'snippets/header.liquid' }, Type: 'LocalMissing', FileTs: 0, LocalTs: 0, RemoteTs: 1751500000000 },
  { File: { Mode: '0', Name: 'assets/theme.css' }, Type: 'RemoteMissing', FileTs: 1751400000000, LocalTs: 1751400000000, RemoteTs: 0 },
];

export const git = {
  available: true,
  isRepo: true,
  branch: 'main',
  dirty: true,
  ahead: 2,
  commitCount: 37,
  lastCommit: 'feat: nowy układ nagłówka',
  remote: 'git@github.com:example/topaz.git',
  history: [
    { hash: 'a1b2c3d', subject: 'feat: nowy układ nagłówka', date: '2026-07-04' },
    { hash: 'e4f5g6h', subject: 'fix: przycinanie długich nazw', date: '2026-07-03' },
  ],
  settings: { autoCommit: true, autoPush: false },
};

export const log = [
  { Id: 1, TS: '12:00:01', Text: '── Nowa sesja ──────────────', Color: '#82bbff', kind: 'separator' },
  { Id: 2, TS: '12:00:02', Text: 'Połączono ze sklepem Sklep Demo', Color: '#4ade80' },
  { Id: 3, TS: '12:00:03', Text: 'Pobrano 128 plików szablonu', Color: '#FFFFFF' },
  { Id: 4, TS: '12:00:05', Text: 'Wykryto 3 konflikty', Color: '#fbbf24' },
];

export const languages = LANGUAGES;

// Bazowy kontekst; `overrides` nadpisuje pojedyncze pola per-story.
export function mockCtx(overrides = {}) {
  return {
    t,
    languages,
    language: 'pl',
    version: '0.9.96',
    shops,
    currentShop,
    currentTemplate,
    mismatches,
    log,
    git,
    progress: null,
    route: { view: 'sync' },
    navigate: () => {},
    api,
    call: async (fn) => fn(),
    toast,
    refreshShops: async () => {},
    refreshTranslations: async () => {},
    changeLanguage: async () => {},
    setMismatches: () => {},
    setLog: () => {},
    setGit: () => {},
    setCurrentTemplate: () => {},
    setCurrentShop: () => {},
    ...overrides,
  };
}

// Owija dowolny ekran w mockowy kontekst. `ctx` = nadpisania fixtures.
export function MockApp({ ctx = {}, children }) {
  return <AppCtx.Provider value={mockCtx(ctx)}>{children}</AppCtx.Provider>;
}
