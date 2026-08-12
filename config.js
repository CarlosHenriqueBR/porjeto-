// ===========================================================================
// CONFIGURAÇÃO DA CENTRAL OPERATION
//
// Preencha aqui e pronto — não precisa mexer em variável de ambiente na Vercel.
//
// LEIA ISTO:
//  · Este arquivo é lido SÓ NO SERVIDOR (pasta api/). Ele nunca vai para o
//    navegador: o build do front só enxerga src/, e a Vercel só serve public/.
//  · Mesmo assim, ele guarda segredos de verdade. Mantenha o REPOSITÓRIO
//    PRIVADO. Se for público, qualquer um lê a chave do seu banco.
//  · Variável de ambiente, quando existir, SEMPRE vence o que está aqui.
//    Assim dá para sobrescrever um valor na Vercel sem editar o arquivo.
// ===========================================================================

export default {
  /* --- BANCO (obrigatório em produção) ----------------------------------
   * Supabase → Settings → API
   *   url : o "Project URL"
   *   key : a chave "service_role" (NUNCA a "anon")
   * Antes do primeiro acesso, rode supabase-setup.sql no SQL Editor.
   * Deixando os dois em branco, o sistema grava em ./data/db.json — o que
   * só funciona rodando na sua máquina, nunca na Vercel.
   */
  SUPABASE_URL: 'https://kwtmwjaavgoywwxhtzba.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3dG13amFhdmdveXd3eGh0emJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ5MzA0OSwiZXhwIjoyMTAyMDY5MDQ5fQ.eP2FKD5YDt42k8V8KN3Ji8f8HI6qEgOGl-XvtDNh-Cw',

  /* --- SEGREDOS (obrigatórios em produção) -------------------------------
   * Gere cada um com:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   *
   * ATENÇÃO: trocar VAULT_SECRET depois de guardar senhas no cofre torna
   * essas senhas ilegíveis para sempre. Defina antes de usar o cofre.
   */
  SESSION_SECRET: 'sb_publishable_jdwu0hmhsZcXuME-mmToFw_pWrIRMAK',
  VAULT_SECRET: 'sb_secret_c1cb_ajRcWFq-9djub7zww_1bRKlMkx',

  /* --- SENHA INICIAL -----------------------------------------------------
   * Só é usada na primeiríssima execução, quando o banco é criado do zero.
   * Cada pessoa é obrigada a trocar no primeiro acesso.
   */
  SEED_PASSWORD: 'Operacao@2026',

  /* --- UTMIFY (opcional) -------------------------------------------------
   * Cole a URL completa do servidor MCP, com o token.
   * Depois use Configurações → Descobrir ferramentas MCP e fixe a escolhida
   * em UTMIFY_MCP_TOOL.
   */
  UTMIFY_MCP_URL: '',
  UTMIFY_MCP_TOOL: '',
  UTMIFY_MCP_ARGS: '',

  /* Protege o cron diário e o endpoint de ingestão externa (n8n, Make…). */
  CRON_SECRET: '',
  INGEST_TOKEN: '',

  /* --- ALTERNATIVAS DE BANCO (deixe em branco se usa Supabase) ------------ */
  DATABASE_URL: '',        // Neon/Postgres — exige: npm i @neondatabase/serverless
  KV_REST_API_URL: '',     // Upstash Redis / Vercel KV
  KV_REST_API_TOKEN: '',
  BLOB_READ_WRITE_TOKEN: '',
};
