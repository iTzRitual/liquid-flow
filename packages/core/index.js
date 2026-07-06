// @liquidflow/core — public API for the shared, presentation-agnostic logic.
// Consumed by both the desktop application (Electron) and the CLI (`liquidflow`).

export { Controller } from './src/controller.js';
export { ISklep24Client, SoapError } from './src/soap.js';
export { SyncSession, MismatchType } from './src/syncEngine.js';
export { translationsFor, tfmt, localeFor, LANGUAGES } from './src/translations.js';
export * as store from './src/store.js';
export * as shareConfig from './src/shareConfig.js';
export { defaultAppDir } from './src/store.js';
export * as git from './src/git.js';
export * as log from './src/log.js';
export { lineDiff, diffSummary, buildDiffRows } from './src/diff.js';

export { connectController, DaemonClient } from './src/daemon/client.js';
export { serve as serveDaemon } from './src/daemon/server.js';
