import { describe, it, expect, beforeEach } from 'vitest';
import * as log from './log.js';

// Reset do czystego kanału 'app' i języka PL przed każdym testem.
beforeEach(() => {
  log.setLanguage('pl');
  log.setActiveChannel('app');
});

describe('deskryptory i18n', () => {
  it('logOk(tmsg) renderuje Text z tłumaczenia dla bieżącego języka', () => {
    const e = log.logOk(log.tmsg('ConnectedToShop', { name: 'Walter' }));
    expect(e.Text).toBe('Połączono ze sklepem: Walter');
    expect(e.msg).toBe('ConnectedToShop');
    expect(e.Color).toBe(log.COLORS.green);
  });

  it('literał (string) zostaje bez tłumaczenia', () => {
    const e = log.logErr('Raw error from stderr');
    expect(e.Text).toBe('Raw error from stderr');
    expect(e.msg).toBeUndefined();
    expect(e.Color).toBe(log.COLORS.red);
  });

  it('setLanguage przerysowuje już wyświetlone wpisy z deskryptorem', () => {
    log.logOk(log.tmsg('ConnectedToShop', { name: 'Walter' }));
    const reset = new Promise((r) => log.events.once('reset', r));
    log.setLanguage('en');
    return reset.then((entries) => {
      expect(entries.at(-1).Text).toBe('Connected to shop: Walter');
    });
  });

  it('setLanguage NIE zmienia wpisów-literałów', () => {
    const e = log.logErr('stderr-line');
    log.setLanguage('en');
    expect(e.Text).toBe('stderr-line');
  });
});

describe('separator', () => {
  it('renderuje klucz + znacznik czasu', () => {
    const ts = Date.parse('2026-06-25T10:00:00Z');
    const e = log.separator({ key: 'NewSession', ts });
    expect(e.kind).toBe('separator');
    expect(e.Text).toContain('Nowa sesja');
    expect(e.Color).toBe(log.COLORS.sep);
  });
});

describe('kanały (scope)', () => {
  it('setActiveChannel emituje reset i nadaje własną sekwencję Id', () => {
    log.logInfo('a');
    log.setActiveChannel('shop:1');
    const e = log.logInfo('b');
    expect(e.Id).toBe(1); // nowy kanał → sekwencja od 1
  });

  it('persist dostaje każdy live-wpis', () => {
    const persisted = [];
    log.setActiveChannel('tpl:1:5', { persist: (e) => persisted.push(e) });
    log.logOk('zapis');
    expect(persisted).toHaveLength(1);
    expect(persisted[0].Text).toBe('zapis');
  });

  it('history ładuje się jako wyszarzone (historic) i renderuje w bieżącym języku', () => {
    log.setActiveChannel('tpl:1:5', {
      history: [{ TS: 't', Color: '#2A2', msg: 'ConnectedToShop', params: { name: 'X' } }],
    });
    const fresh = log.since(0);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].historic).toBe(true);
    expect(fresh[0].Text).toBe('Połączono ze sklepem: X');
  });
});

describe('since / waitFor', () => {
  it('since zwraca tylko wpisy o Id > lastId', () => {
    log.logInfo('a');
    const second = log.logInfo('b');
    expect(log.since(second.Id - 1).map((e) => e.Text)).toEqual(['b']);
  });

  it('waitFor budzi się, gdy pojawia się nowy wpis', async () => {
    const p = log.waitFor(0, 1000);
    log.logInfo('świeży');
    const got = await p;
    expect(got.at(-1).Text).toBe('świeży');
  });

  it('waitFor zwraca [] po timeoucie bez wpisów', async () => {
    expect(await log.waitFor(999, 20)).toEqual([]);
  });
});
