import { readDb } from './store.js';
import { verifySession, signSession } from './crypto.js';

export const COOKIE = 'sc_session';

/**
 * Envolve um handler para que erros de configuração (banco ausente, segredo
 * faltando) cheguem à tela com nome próprio, em vez de virar um 500 mudo.
 */
export function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      if (res.headersSent) return;
      if (e && e.code === 'DB_CONFIG') {
        return json(res, 503, {
          error: 'banco_nao_configurado',
          hint: 'Defina DATABASE_URL (Neon/Postgres) nas variáveis de ambiente e faça um novo deploy. Abra /api/health para o diagnóstico completo.',
        });
      }
      console.error('[api]', req.url, e);
      return json(res, 500, { error: 'erro_interno' });
    }
  };
}
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, userId) {
  const token = signSession({ uid: userId, exp: Date.now() + MAX_AGE * 1000 });
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`
  );
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export async function getUser(req) {
  const token = parseCookies(req)[COOKIE];
  const payload = verifySession(token);
  if (!payload) return null;
  const db = await readDb();
  const user = db.users.find((u) => u.id === payload.uid);
  if (!user || !user.active) return null;
  return user;
}

export async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    json(res, 401, { error: 'nao_autenticado' });
    return null;
  }
  return user;
}

/** Bloqueia a requisição se o usuário não tiver acesso ao pilar. */
export function requirePillar(res, user, pillar) {
  if (user.role === 'owner' || user.perms?.[pillar] === true) return true;
  json(res, 403, { error: 'sem_permissao', pillar });
  return false;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('payload muito grande');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/* --------------------------- rate limit simples -------------------------- */
const buckets = new Map();

export function rateLimit(key, { max = 10, windowMs = 10 * 60_000, peek = false } = {}) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    if (!peek) buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }
  if (peek) {
    return b.count >= max
      ? { ok: false, retryIn: Math.ceil((b.reset - now) / 1000) }
      : { ok: true, remaining: max - b.count };
  }
  b.count += 1;
  if (b.count > max) return { ok: false, retryIn: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, remaining: max - b.count };
}

export const clearRateLimit = (key) => buckets.delete(key);
