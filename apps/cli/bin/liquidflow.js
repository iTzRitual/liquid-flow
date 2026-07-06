#!/usr/bin/env node
// Entry point for the `liquidflow` CLI. Registers JSX transpilation (tsx), then
// launches the interactive Ink interface. This means no separate build step is
// needed — the source code (.jsx) runs directly.

import { register } from 'tsx/esm/api';

process.title = 'liquidflow';

register();
await import(new URL('../src/index.jsx', import.meta.url).href);
