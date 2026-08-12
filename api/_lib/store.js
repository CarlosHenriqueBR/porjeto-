// ---------------------------------------------------------------------------
// Banco JSON com 4 drivers, escolhidos automaticamente pelas variáveis de
// ambiente presentes (nesta ordem de prioridade):
//   1. Neon / Postgres (DATABASE_URL)         -> produção  [recomendado]
//   2. KV REST (Vercel KV / Upstash Redis)    -> produção
//   3. Vercel Blob                            -> produção
//   4. Arquivo local ./data/db.json           -> desenvolvimento
// ---------------------------------------------------------------------------
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hashPassword } from './crypto.js';
import { SECTORS, ALL_PERMS } from './model.js';

const PG_URL =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const DB_KEY = process.env.DB_KEY || 'central-db';
const FILE_PATH = path.join(process.cwd(), 'data', 'db.json');

export const DRIVER =
  PG_URL ? 'neon'
  : KV_URL && KV_TOKEN ? 'kv'
  : BLOB_TOKEN ? 'blob'
  : 'file';

/**
 * Na Vercel o disco é somente-leitura: o driver de arquivo não tem como criar
 * nem gravar o banco. Em vez de estourar um 500 genérico (que na tela virava
 * "e-mail ou senha incorretos"), falhamos com um erro nomeado que a tela de
 * login sabe explicar.
 */
export const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
export const DB_CONFIGURED = DRIVER !== 'file' || !IS_SERVERLESS;
export const HAS_PG = !!PG_URL;

export function dbConfigError() {
  const e = new Error('banco_nao_configurado');
  e.code = 'DB_CONFIG';
  return e;
}

/* ------------------------------- drivers -------------------------------- */

/* ----- Neon / Postgres -----------------------------------------------------
 * O banco inteiro vive num único registro JSONB. Mantém o modelo "um JSON"
 * que o resto do sistema espera e ainda assim ganha durabilidade de verdade.
 * Usa o driver oficial @neondatabase/serverless (HTTP, sem TCP) — funciona em
 * qualquer Postgres que aceite conexão via a URL, incluindo Neon e Supabase.
 * -------------------------------------------------------------------------- */
let sqlClient = null;
let tableReady = false;

async function pgClient() {
  if (sqlClient) return sqlClient;
  let neon;
  try {
    ({ neon } = await import('@neondatabase/serverless'));
  } catch {
    const e = new Error(
      'Pacote @neondatabase/serverless não encontrado. Rode "npm install" (ele já está no package.json).'
    );
    e.code = 'DB_CONFIG';
    throw e;
  }
  sqlClient = neon(PG_URL);
  return sqlClient;
}

async function pgEnsureTable() {
  if (tableReady) return;
  const sql = await pgClient();
  await sql`CREATE TABLE IF NOT EXISTS central_db (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  tableReady = true;
}

async function pgRead() {
  await pgEnsureTable();
  const sql = await pgClient();
  const rows = await sql`SELECT data FROM central_db WHERE id = ${DB_KEY}`;
  const row = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
  if (!row) return null;
  return typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
}

async function pgWrite(db) {
  await pgEnsureTable();
  const sql = await pgClient();
  await sql`
    INSERT INTO central_db (id, data, updated_at)
    VALUES (${DB_KEY}, ${JSON.stringify(db)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}

async function kvRead() {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(DB_KEY)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }, cache: 'no-store',
  });
  if (!r.ok) throw new Error(`KV read ${r.status}`);
  const j = await r.json();
  if (j.result == null) return null;
  return typeof j.result === 'string' ? JSON.parse(j.result) : j.result;
}

async function kvWrite(db) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(DB_KEY)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(db),
  });
  if (!r.ok) throw new Error(`KV write ${r.status} ${await r.text()}`);
}

const BLOB_PATH = `${DB_KEY}.json`;
let blobUrlCache = null;

async function blobRead() {
  if (!blobUrlCache) {
    const r = await fetch(`https://blob.vercel-storage.com/?prefix=${encodeURIComponent(BLOB_PATH)}&limit=1`, {
      headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7' }, cache: 'no-store',
    });
    if (!r.ok) return null;
    blobUrlCache = (await r.json()).blobs?.[0]?.url || null;
  }
  if (!blobUrlCache) return null;
  const r = await fetch(`${blobUrlCache}?t=${Date.now()}`, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

async function blobWrite(db) {
  const r = await fetch(`https://blob.vercel-storage.com/${encodeURIComponent(BLOB_PATH)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7',
      'x-content-type': 'application/json', 'x-add-random-suffix': '0',
      'x-allow-overwrite': '1', 'x-cache-control-max-age': '0',
    },
    body: JSON.stringify(db),
  });
  if (!r.ok) throw new Error(`Blob write ${r.status} ${await r.text()}`);
  blobUrlCache = (await r.json()).url || blobUrlCache;
}

async function fileRead() {
  try { return JSON.parse(await fs.readFile(FILE_PATH, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

async function fileWrite(db) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  const tmp = `${FILE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, FILE_PATH);
}

const driver =
  DRIVER === 'neon' ? { read: pgRead, write: pgWrite }
  : DRIVER === 'kv' ? { read: kvRead, write: kvWrite }
  : DRIVER === 'blob' ? { read: blobRead, write: blobWrite }
  : { read: fileRead, write: fileWrite };

/* ------------------------------ seed / cache ---------------------------- */

const ADMIN_SEED = [
  { name: 'Artur Maia', email: 'artur@operacao.com' },
  { name: 'Carlos Henrique', email: 'carlos@operacao.com' },
  { name: 'Elisson', email: 'elisson@operacao.com' },
];

export function emptyDb() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: [],
    sectors: SECTORS.map((s) => ({ ...s })),
    domains: [],
    accounts: [],
    structures: [],
    metrics: [],       // tráfego: um registro por dia
    entries: [],       // financeiro: entradas e saídas
    tasks: [],         // logística
    vault: [],
    activities: [],
    notifications: [],
    settings: { utmifyLastSync: null, currency: 'BRL', companyName: 'Central Operation' },
  };
}

export async function seedDb() {
  const db = emptyDb();
  const pass = process.env.SEED_PASSWORD || 'Operacao@2026';
  for (const a of ADMIN_SEED) {
    db.users.push({
      id: cid('u'), name: a.name, email: a.email,
      role: 'owner', perms: ALL_PERMS(), active: true,
      passHash: hashPassword(pass), mustChangePassword: true,
      createdAt: new Date().toISOString(),
    });
  }
  logActivity(db, null, {
    entity: 'sistema', entityId: null, action: 'seed',
    message: 'Central Operation inicializada com os 3 sócios como owners.',
  });
  await driver.write(db);
  return db;
}

let cache = { db: null, at: 0 };
const READ_TTL = Number(process.env.READ_TTL_MS ?? 1200);

export async function readDb({ fresh = false } = {}) {
  if (!DB_CONFIGURED) throw dbConfigError();
  const now = Date.now();
  if (!fresh && cache.db && now - cache.at < READ_TTL) return cache.db;
  let db = await driver.read();
  if (!db) db = await seedDb();
  const base = emptyDb();
  for (const k of Object.keys(base)) if (db[k] === undefined) db[k] = base[k];
  cache = { db, at: now };
  return db;
}

let chain = Promise.resolve();

export function updateDb(mutator) {
  const run = chain.then(async () => {
    const db = await readDb({ fresh: true });
    const result = await mutator(db);
    db.version = (db.version || 0) + 1;
    db.updatedAt = new Date().toISOString();
    if (db.activities.length > 1200) db.activities = db.activities.slice(0, 1200);
    if (db.notifications.length > 400) db.notifications = db.notifications.slice(0, 400);
    await driver.write(db);
    cache = { db, at: Date.now() };
    return { db, result };
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

/* ------------------------------- helpers -------------------------------- */

export function cid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function logActivity(db, user, { entity, entityId, action, message, pillar = null }) {
  db.activities.unshift({
    id: cid('a'), ts: new Date().toISOString(),
    userId: user?.id || 'system', userName: user?.name || 'Sistema',
    entity, entityId: entityId || null, action, message, pillar,
  });
}

export function notify(db, user, { message, kind = 'info', link = null, pillar = null }) {
  db.notifications.unshift({
    id: cid('n'), ts: new Date().toISOString(),
    actorId: user?.id || 'system', actorName: user?.name || 'Sistema',
    kind, message, link, pillar, readBy: user?.id ? [user.id] : [],
  });
}
