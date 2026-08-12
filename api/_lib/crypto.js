import crypto from 'node:crypto';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'dev-only-session-secret-troque-em-producao';
const VAULT_SECRET =
  process.env.VAULT_SECRET || 'dev-only-vault-secret-troque-em-producao';

/* ----------------------------- senhas (scrypt) --------------------------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(keyB64, 'base64url');
    const got = crypto.scryptSync(String(password), salt, expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

/* --------------------------- sessão (HMAC token) ------------------------- */

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signSession(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* --------------------------- cofre (AES-256-GCM) ------------------------- */

const vaultKey = crypto.scryptSync(VAULT_SECRET, 'controle-vault-v1', 32);

export function encryptSecret(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
}

export function decryptSecret(payload) {
  if (!payload) return '';
  try {
    const [v, ivB, tagB, ctB] = String(payload).split('.');
    if (v !== 'v1') return '';
    const d = crypto.createDecipheriv('aes-256-gcm', vaultKey, Buffer.from(ivB, 'base64url'));
    d.setAuthTag(Buffer.from(tagB, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ctB, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export const randomToken = (n = 24) => crypto.randomBytes(n).toString('base64url');
