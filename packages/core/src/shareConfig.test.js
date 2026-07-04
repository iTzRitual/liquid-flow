import { describe, it, expect } from 'vitest';
import {
  buildShopRecords,
  buildEnvelope,
  readEnvelope,
  ShareError,
} from './shareConfig.js';

describe('shareConfig crypto module', () => {
  const fakeDecrypt = (stored) => (stored.startsWith('enc:') ? stored.slice(4) : stored);
  const sampleShops = [
    {
      Id: 1,
      Name: 'Shop1',
      Url: 'http://shop1.com',
      Login: 'webmaster',
      SavePassword: true,
      Password: 'enc:topsecret',
      Templates: [
        { Id: 10, Name: 'Tpl1', SavePassword: true, Password: 'enc:tplsecret' },
      ],
    },
  ];

  it('roundtrips with passphrase', () => {
    const records = buildShopRecords(sampleShops, fakeDecrypt, true);
    expect(records[0].Password).toBe('topsecret');
    expect(records[0].Templates[0].Password).toBe('tplsecret');

    const env = buildEnvelope(records, 'myphrase');
    expect(env.encrypted).toBe(true);

    const decryptedRecords = readEnvelope(env, 'myphrase');
    expect(decryptedRecords).toEqual(records);
  });

  it('throws BadPassphrase on wrong passphrase', () => {
    const records = buildShopRecords(sampleShops, fakeDecrypt, true);
    const env = buildEnvelope(records, 'myphrase');

    expect(() => readEnvelope(env, 'wrongphrase')).toThrow(ShareError);
    try {
      readEnvelope(env, 'wrongphrase');
    } catch (e) {
      expect(e.code).toBe('BadPassphrase');
    }
  });

  it('throws PassphraseRequired on missing passphrase for encrypted envelope', () => {
    const records = buildShopRecords(sampleShops, fakeDecrypt, true);
    const env = buildEnvelope(records, 'myphrase');

    expect(() => readEnvelope(env, '')).toThrow(ShareError);
    try {
      readEnvelope(env, '');
    } catch (e) {
      expect(e.code).toBe('PassphraseRequired');
    }
  });

  it('handles empty passphrase by stripping secrets and leaving envelope unencrypted', () => {
    const records = buildShopRecords(sampleShops, fakeDecrypt, false);
    expect(records[0].SavePassword).toBe(false);
    expect(records[0].Password).toBe('');
    expect(records[0].Templates[0].SavePassword).toBe(false);
    expect(records[0].Templates[0].Password).toBe('');

    const env = buildEnvelope(records, '');
    expect(env.encrypted).toBe(false);

    const decryptedRecords = readEnvelope(env, '');
    expect(decryptedRecords).toEqual(records);
  });

  it('throws BadFormat on invalid envelope format', () => {
    expect(() => readEnvelope({ app: 'InvalidApp' }, '')).toThrow(ShareError);
    try {
      readEnvelope({ app: 'InvalidApp' }, '');
    } catch (e) {
      expect(e.code).toBe('BadFormat');
    }
  });

  it('does not leak plaintext passwords in serialized encrypted envelope', () => {
    const records = buildShopRecords(sampleShops, fakeDecrypt, true);
    const env = buildEnvelope(records, 'myphrase');
    const jsonStr = JSON.stringify(env);

    expect(jsonStr.includes('topsecret')).toBe(false);
    expect(jsonStr.includes('tplsecret')).toBe(false);
  });
});
