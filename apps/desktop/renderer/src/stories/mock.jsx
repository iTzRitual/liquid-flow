// A mock app context for Storybook (the design gallery).
//
// Desktop components get EVERYTHING (t, api, data, handlers) via `useApp()` from
// `AppCtx`. Here we inject a stub of that context, so a single screen can be
// rendered in isolation, without Electron and without connecting to a shop. We
// take `t` from a real source (a deep-import of the pure translations.js file —
// without `node:` modules), so the PL/EN texts are genuine.
import React from 'react';
import { toast } from 'sonner';
import { AppCtx } from '../App.jsx';
import { translationsFor, LANGUAGES } from '@liquidflow/core/translations.js';

const t = translationsFor('pl');

// A stub of the IPC bridge — every method is an async no-op (logs the call to
// the console) unless `overrides` supplies a fixture-backed implementation
// for it (e.g. `listTemplates` returning the `templates` fixture below).
export function mockApi(overrides = {}) {
  return new Proxy(overrides, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async (...args) => {
        // eslint-disable-next-line no-console
        console.info(`[mock api] ${String(prop)}`, ...args);
        return undefined;
      };
    },
  });
}

const api = mockApi();

// ————— Fixtures (sample data for screens) —————

export const shops = [
  { Id: 'demo-1', Name: 'Sklep Demo', Url: 'https://demo.comarch.pl/sklep', SavePassword: true },
  { Id: 'demo-2', Name: 'Topaz Testowy', Url: 'https://topaz.example.com', SavePassword: false },
];

export const currentShop = shops[0];
export const currentTemplate = { Id: '42', Name: 'Topaz — Główny' };

export const templates = [
  { Id: 1, Name: 'Topaz 2024.10.2', Locked: false },
  { Id: 2, Name: 'Topaz 2023.5', Locked: false },
  { Id: 3, Name: 'One Page Shop 2024.1', Locked: true },
  { Id: 4, Name: 'Custom Liquid', Locked: false },
];

// Note: `File` is an OBJECT { Mode, Name } (not a string) — components key and
// display rows as `Mode/Name`.
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

// The base context; `overrides` overrides individual fields per story.
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

// Wraps any screen in the mock context. `ctx` = fixture overrides.
export function MockApp({ ctx = {}, children }) {
  return <AppCtx.Provider value={mockCtx(ctx)}>{children}</AppCtx.Provider>;
}
