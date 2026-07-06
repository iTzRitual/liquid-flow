// Portable shop configuration bundle (export/import between machines).
// Passwords in config.json are encrypted with the machine's LOCAL KEY, so a raw
// copy is useless elsewhere. Here we: (1) build records with DECRYPTED passwords
// (the caller provides decryptFn), (2) encrypt the WHOLE bundle with the user's
// passphrase (PBKDF2 + AES-256-GCM). An empty passphrase → a bundle WITHOUT passwords.
import crypto from 'node:crypto';

export const BUNDLE_APP = 'LiquidFlow';
export const BUNDLE_KIND = 'shops-export';
export const BUNDLE_VERSION = 1;
const KDF_ITERS = 210000;

export class ShareError extends Error {
  constructor(code) { super(code); this.name = 'ShareError'; this.code = code; }
}

// Build shareable records from the FULL config.Shops records.
// includeSecrets=false → passwords omitted (SavePassword=false), for a passphrase-less bundle.
export function buildShopRecords(shops, decryptFn, includeSecrets) {
  return (shops || []).map((s) => {
    const rec = {
      Name: s.Name,
      Url: s.Url,
      Login: s.Login || 'webmaster',
      SavePassword: includeSecrets ? !!s.SavePassword : false,
      Password: (includeSecrets && s.SavePassword && s.Password) ? decryptFn(s.Password) : '',
      Templates: [],
    };
    if (Array.isArray(s.Templates)) {
      rec.Templates = s.Templates.map((tpl) => ({
        Id: tpl.Id,
        Name: tpl.Name,
        SavePassword: includeSecrets ? !!tpl.SavePassword : false,
        Password: (includeSecrets && tpl.SavePassword && tpl.Password) ? decryptFn(tpl.Password) : '',
      }));
    }
    return rec;
  });
}

// Pack records into a portable envelope. An empty passphrase → a plaintext envelope
// (the records must already be free of secrets). A non-empty one → PBKDF2 + AES-256-GCM.
export function buildEnvelope(records, passphrase) {
  const pass = passphrase == null ? '' : String(passphrase);
  const base = {
    app: BUNDLE_APP, kind: BUNDLE_KIND, version: BUNDLE_VERSION,
    createdAt: new Date().toISOString(),
  };
  if (!pass) return { ...base, encrypted: false, shops: records };

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(pass, salt, KDF_ITERS, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(records), 'utf8')), c.final()]);
  return {
    ...base, encrypted: true, cipher: 'aes-256-gcm', kdf: 'pbkdf2-sha256',
    iterations: KDF_ITERS,
    salt: salt.toString('base64'), iv: iv.toString('base64'),
    authTag: c.getAuthTag().toString('base64'), data: enc.toString('base64'),
  };
}

// Read an envelope → records. Throws ShareError('BadFormat'|'PassphraseRequired'|'BadPassphrase').
export function readEnvelope(envelope, passphrase) {
  if (!envelope || envelope.app !== BUNDLE_APP || envelope.kind !== BUNDLE_KIND) {
    throw new ShareError('BadFormat');
  }
  if (!envelope.encrypted) {
    if (!Array.isArray(envelope.shops)) throw new ShareError('BadFormat');
    return envelope.shops;
  }
  const pass = passphrase == null ? '' : String(passphrase);
  if (!pass) throw new ShareError('PassphraseRequired');
  try {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.authTag, 'base64');
    const data = Buffer.from(envelope.data, 'base64');
    const key = crypto.pbkdf2Sync(pass, salt, envelope.iterations || KDF_ITERS, 32, 'sha256');
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    const pt = Buffer.concat([d.update(data), d.final()]);
    return JSON.parse(pt.toString('utf8'));
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError('BadPassphrase'); // wrong passphrase → GCM auth fail
  }
}
