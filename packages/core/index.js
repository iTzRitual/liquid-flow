// @liquidflow/core — publiczne API logiki wspólnej (niezależnej od warstwy
// prezentacji). Używane zarówno przez aplikację desktopową (Electron), jak i
// przez CLI (`liquidflow`).

export { Controller } from './src/controller.js';
export { ISklep24Client, SoapError } from './src/soap.js';
export { SyncSession, MismatchType } from './src/syncEngine.js';
export { translationsFor, tfmt, localeFor, LANGUAGES } from './src/translations.js';
export * as store from './src/store.js';
export * as git from './src/git.js';
export * as log from './src/log.js';
