// ---------------------------------------------------------------------------
// Diagnóstico do deploy. Não exige login, porque serve justamente para quando
// o login não funciona. Devolve só booleanos e contagens — nenhum valor de
// segredo, nenhum dado da operação.
//   GET /api/health
// ---------------------------------------------------------------------------
import { DRIVER, DB_CONFIGURED, IS_SERVERLESS, readDb } from './_lib/store.js';
import { json } from './_lib/http.js';

export default async function handler(_req, res) {
  const env = {
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    VAULT_SECRET: !!process.env.VAULT_SECRET,
    SEED_PASSWORD: !!process.env.SEED_PASSWORD,
    DATABASE_URL: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL),
    KV_REST_API_URL: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    KV_REST_API_TOKEN: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    UTMIFY_MCP_URL: !!process.env.UTMIFY_MCP_URL,
  };

  const problems = [];
  if (!DB_CONFIGURED) {
    problems.push(
      'Banco não configurado: em produção o disco é somente-leitura. Defina DATABASE_URL (Neon/Postgres) ou KV_REST_API_URL + KV_REST_API_TOKEN (Upstash).'
    );
  }
  if (IS_SERVERLESS && !env.SESSION_SECRET) {
    problems.push('SESSION_SECRET não definida — as sessões caem a cada novo deploy.');
  }
  if (IS_SERVERLESS && !env.VAULT_SECRET) {
    problems.push('VAULT_SECRET não definida — defina antes de guardar a primeira senha no cofre.');
  }

  let db = { ok: false, users: 0, error: null };
  if (DB_CONFIGURED) {
    try {
      const data = await readDb({ fresh: true });
      db = { ok: true, users: data.users.length, version: data.version, error: null };
    } catch (e) {
      db = { ok: false, users: 0, error: String(e.message || e) };
      problems.push(`Não consegui ler o banco: ${e.message}`);
    }
  }

  return json(res, problems.length ? 503 : 200, {
    ok: problems.length === 0 && db.ok,
    serverless: IS_SERVERLESS,
    driver: DRIVER,
    env,
    db,
    problems,
    hint: problems.length
      ? 'Depois de definir as variáveis na Vercel, faça um NOVO DEPLOY — variáveis novas só valem para builds novos.'
      : 'Tudo certo. Entre com o e-mail do sócio e a senha de SEED_PASSWORD (padrão Operacao@2026).',
  });
}
