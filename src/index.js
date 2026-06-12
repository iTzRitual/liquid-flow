#!/usr/bin/env node
// Comarch e-Sklep Liquid Sync — wersja na macOS.
// Uruchamia lokalny serwer i otwiera interfejs w przeglądarce.

import { exec } from 'node:child_process';
import { AppServer } from './server.js';
import { paths } from './store.js';

const args = process.argv.slice(2);
const insecureTLS = args.includes('--insecure') || process.env.LIQUID_SYNC_INSECURE === '1';
const noBrowser = args.includes('--no-browser');

const app = new AppServer({ insecureTLS });
const url = `http://127.0.0.1:${app.config.Port}/`;

app.listen().then(() => {
  console.log('────────────────────────────────────────────────');
  console.log('  Comarch e-Sklep Liquid Sync (macOS)');
  console.log('  Interfejs:    ' + url);
  console.log('  Dane/projekt: ' + paths.SHOPS_DIR);
  console.log('  Konfiguracja: ' + paths.CONFIG_PATH);
  if (insecureTLS) console.log('  ⚠️  Tryb --insecure: pomijam weryfikację certyfikatu TLS');
  console.log('  Zatrzymanie:  Ctrl+C');
  console.log('────────────────────────────────────────────────');
  if (app.config.StartBrowser && !noBrowser) {
    exec(`open ${JSON.stringify(url)}`);
  }
});

process.on('SIGINT', () => { console.log('\nKończę.'); process.exit(0); });
