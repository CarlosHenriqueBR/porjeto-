// ---------------------------------------------------------------------------
// Origem das configurações, em ordem de precedência:
//   1. Variável de ambiente (Vercel, .env.local, shell)
//   2. config.js na raiz do projeto
//
// O import é literal de propósito: o rastreador de dependências da Vercel
// (@vercel/nft) consegue enxergar e incluir o config.js no pacote da função.
// Um import dinâmico com variável passaria despercebido e o arquivo ficaria
// de fora do deploy.
// ---------------------------------------------------------------------------

let fileConfig = {};
let fileError = null;

try {
  const mod = await import('../../config.js');
  fileConfig = mod.default ?? mod ?? {};
} catch (e) {
  // Rodar sem config.js é perfeitamente válido — basta usar variáveis de ambiente.
  fileError = String(e?.message || e);
}

const clean = (v) => (typeof v === 'string' ? v.trim() : v);

/** Lê uma configuração. Aceita vários nomes (o primeiro preenchido vence). */
export function cfg(names, fallback = '') {
  for (const name of [].concat(names)) {
    const fromEnv = clean(process.env[name]);
    if (fromEnv) return fromEnv;
  }
  for (const name of [].concat(names)) {
    const fromFile = clean(fileConfig[name]);
    if (fromFile) return fromFile;
  }
  return fallback;
}

/** De onde veio o valor — usado pelo /api/health para explicar o estado. */
export function cfgSource(names) {
  for (const name of [].concat(names)) if (clean(process.env[name])) return 'ambiente';
  for (const name of [].concat(names)) if (clean(fileConfig[name])) return 'config.js';
  return null;
}

export const CONFIG_FILE_LOADED = !fileError;
export const CONFIG_FILE_ERROR = fileError;
