// ---------------------------------------------------------------------------
// Diagnóstico do deploy. Não exige login, porque serve justamente para quando
// o login não funciona. Devolve só booleanos e contagens — nenhum valor de
// segredo, nenhum dado da operação.
//
// Esta rota é deliberadamente PARANOICA: ela não importa nada no topo do
// arquivo. Se o módulo do banco explodir ao carregar, o resto da API devolve
// FUNCTION_INVOCATION_FAILED (uma página de erro da Vercel, sem explicação) —
// mas esta aqui continua respondendo e diz o que aconteceu.
//   GET /api/health
// ---------------------------------------------------------------------------

export const BUILD = '2026-08-12.4-config';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body, null, 2));
}

const KEYS = {
  SESSION_SECRET: 'SESSION_SECRET',
  VAULT_SECRET: 'VAULT_SECRET',
  SEED_PASSWORD: 'SEED_PASSWORD',
  SUPABASE_URL: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
  SUPABASE_SERVICE_ROLE_KEY: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_KEY'],
  DATABASE_URL: ['DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL'],
  KV_REST_API_URL: ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'],
  KV_REST_API_TOKEN: ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'],
  BLOB_READ_WRITE_TOKEN: 'BLOB_READ_WRITE_TOKEN',
  UTMIFY_MCP_URL: 'UTMIFY_MCP_URL',
};

export default async function handler(_req, res) {
  const problems = [];

  // O carregador de configuração também é importado sob demanda: se o
  // config.js tiver um erro de sintaxe, esta rota ainda responde e conta isso.
  let config = null;
  try {
    config = await import('./_lib/config.js');
  } catch (e) {
    return send(res, 503, {
      ok: false, build: BUILD, node: process.version,
      problems: [`O config.js não carregou: ${e.message}. Confira a sintaxe do arquivo na raiz do projeto.`],
    });
  }

  // "onde está definido cada valor" — sem jamais mostrar o valor em si
  const env = {};
  const origem = {};
  for (const [label, names] of Object.entries(KEYS)) {
    const src = config.cfgSource(names);
    env[label] = !!src;
    origem[label] = src ?? '—';
  }

  const base = {
    build: BUILD,
    node: process.version,
    serverless: !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME),
    configFile: config.CONFIG_FILE_LOADED ? 'carregado' : `ausente (${config.CONFIG_FILE_ERROR})`,
    origem,
    env,
  };

  // Supabase pela metade é o erro mais comum: uma das duas variáveis faltando.
  if (env.SUPABASE_URL !== env.SUPABASE_SERVICE_ROLE_KEY) {
    problems.push(
      env.SUPABASE_URL
        ? 'SUPABASE_URL preenchida mas SUPABASE_SERVICE_ROLE_KEY não — as duas são necessárias.'
        : 'SUPABASE_SERVICE_ROLE_KEY preenchida mas SUPABASE_URL não — as duas são necessárias.'
    );
  }

  // 1) O pacote do Postgres está instalado? (só importa no driver do Neon)
  let driverPackage = 'nao_usado';
  if (env.DATABASE_URL && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) {
    try {
      await import('@neondatabase/serverless');
      driverPackage = 'ok';
    } catch (e) {
      driverPackage = `ausente: ${e.message}`;
      problems.push(
        'O pacote @neondatabase/serverless não carregou. Confirme que ele está em "dependencies" no package.json e refaça o deploy — este é o sintoma de deploy com código antigo.'
      );
    }
  }

  // 2) O módulo do banco carrega?
  let store = null;
  try {
    store = await import('./_lib/store.js');
  } catch (e) {
    problems.push(`O módulo do banco não carregou: ${e.message}`);
    return send(res, 503, { ok: false, ...base, driverPackage, problems });
  }

  if (!store.DB_CONFIGURED) {
    problems.push(
      'Banco não configurado: em produção o disco é somente-leitura. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no config.js (ou nas variáveis de ambiente).'
    );
  }
  if (base.serverless && !env.SESSION_SECRET) {
    problems.push('SESSION_SECRET vazia — preencha no config.js. Sem ela, as sessões caem a cada novo deploy.');
  }
  if (base.serverless && !env.VAULT_SECRET) {
    problems.push('VAULT_SECRET vazia — preencha no config.js antes de guardar a primeira senha no cofre.');
  }

  // 3) O banco responde?
  let db = { ok: false, users: 0, error: null };
  if (store.DB_CONFIGURED) {
    try {
      const data = await store.readDb({ fresh: true });
      db = { ok: true, users: data.users.length, version: data.version, error: null };
    } catch (e) {
      db = { ok: false, users: 0, error: String(e.message || e) };
      problems.push(`Não consegui ler o banco: ${e.message}`);
    }
  }

  return send(res, problems.length ? 503 : 200, {
    ok: problems.length === 0 && db.ok,
    ...base,
    driver: store.DRIVER,
    driverPackage,
    db,
    problems,
    hint: problems.length
      ? 'Depois de ajustar o config.js (ou as variáveis de ambiente), faça um NOVO DEPLOY.'
      : 'Tudo certo. Entre com o e-mail do sócio e a senha inicial.',
  });
}
