#!/usr/bin/env node
// Punkt wejścia CLI `liquidflow`. Rejestruje transpilację JSX (tsx), a następnie
// uruchamia interaktywny interfejs Ink. Dzięki temu nie jest potrzebny osobny
// krok budowania — kod źródłowy (.jsx) działa bezpośrednio.

import { register } from 'tsx/esm/api';

register();
await import(new URL('../src/index.jsx', import.meta.url).href);
