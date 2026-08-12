// ---------------------------------------------------------------------------
// Integração UTMify — três caminhos, todos aterrissando em finance[].
//
// 1) MCP  (preferido)  UTMIFY_MCP_URL  →  fala JSON-RPC com o servidor MCP da
//    UTMify, chama a ferramenta de métricas e grava faturamento/gasto/lucro.
//    Descubra as ferramentas disponíveis com:  POST /api/sync-utmify {"op":"discover"}
//    e fixe a escolhida em UTMIFY_MCP_TOOL (+ UTMIFY_MCP_ARGS, se precisar).
//
// 2) REST         UTMIFY_METRICS_URL + UTMIFY_TOKEN  (endpoint HTTP qualquer)
//
// 3) PUSH         POST com header x-ingest-token e {date,revenue,adSpend}
//                 (n8n / Make / script próprio) — sempre funciona.
//
// O cron da Vercel chama esta rota diariamente (ver vercel.json).
// ---------------------------------------------------------------------------
import { updateDb, logActivity, notify } from './_lib/store.js';
import { json, readBody, getUser, withErrors } from './_lib/http.js';
import { createMcpClient, unwrapToolResult, findNumber, dig } from './_lib/mcp.js';
import { cfg } from './_lib/config.js';

const TZ = 'America/Sao_Paulo';

const todayBR = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + offsetDays * 86400000));

const toNum = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const ALIAS = {
  revenue: ['revenue', 'faturamento', 'grossrevenue', 'totalrevenue', 'receita', 'netrevenue', 'sales', 'valor', 'amount'],
  adSpend: ['adspend', 'adscost', 'spend', 'gasto', 'gastoads', 'custoads', 'adcost', 'cost', 'investimento', 'investment'],
  otherCost: ['fees', 'taxas', 'othercost', 'outroscustos', 'chargeback', 'refund'],
  profit: ['profit', 'lucro', 'netprofit', 'lucroliquido', 'margin'],
};

async function authorize(req) {
  const secret = cfg('CRON_SECRET');
  if (secret && req.headers.authorization === `Bearer ${secret}`) return { id: 'system', name: 'Cron' };
  const ingest = cfg('INGEST_TOKEN');
  if (ingest && req.headers['x-ingest-token'] === ingest) return { id: 'system', name: 'Integração' };
  if (req.headers['x-vercel-cron']) return { id: 'system', name: 'Cron' };
  return (await getUser(req)) || null;
}

async function handler(req, res) {
  const actor = await authorize(req);
  if (!actor) return json(res, 401, { error: 'nao_autorizado' });

  const body = req.method === 'POST' ? await readBody(req) : {};
  const op = body.op || 'sync';
  const mcpUrl = cfg('UTMIFY_MCP_URL');

  /* ------------------------- descoberta de ferramentas ------------------- */
  if (op === 'discover') {
    if (!mcpUrl) return json(res, 400, { error: 'sem_mcp_url', hint: 'Defina UTMIFY_MCP_URL nas variáveis de ambiente da Vercel.' });
    try {
      const client = createMcpClient(mcpUrl);
      const info = await client.initialize();
      const tools = await client.listTools();
      const resources = await client.listResources();
      return json(res, 200, {
        ok: true,
        server: info?.serverInfo || null,
        tools: (tools?.tools || []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        resources: (resources?.resources || []).map((r) => ({ uri: r.uri, name: r.name, description: r.description })),
      });
    } catch (e) {
      return json(res, 502, { error: 'mcp_falhou', detail: String(e.message || e) });
    }
  }

  /* ------------------------------ chamada crua --------------------------- */
  if (op === 'call') {
    const me = await getUser(req);
    if (!me) return json(res, 401, { error: 'nao_autorizado' });
    if (!mcpUrl) return json(res, 400, { error: 'sem_mcp_url' });
    try {
      const client = createMcpClient(mcpUrl);
      await client.initialize();
      const result = await client.callTool(body.tool, body.args || {});
      return json(res, 200, { ok: true, raw: result, parsed: unwrapToolResult(result) });
    } catch (e) {
      return json(res, 502, { error: 'mcp_falhou', detail: String(e.message || e) });
    }
  }

  /* --------------------------------- sync -------------------------------- */
  let rows = [];
  let via = '';

  if (body.date || Array.isArray(body.days)) {
    via = 'push';
    rows = (Array.isArray(body.days) ? body.days : [body]).map((r) => ({
      date: String(r.date || todayBR()).slice(0, 10),
      revenue: toNum(r.revenue),
      adSpend: toNum(r.adSpend ?? r.adsCost ?? r.spend),
      otherCost: toNum(r.otherCost ?? r.fees ?? 0),
    }));
  } else if (mcpUrl) {
    via = 'mcp';
    const date = String(body.targetDate || todayBR()).slice(0, 10);
    try {
      const client = createMcpClient(mcpUrl);
      await client.initialize();

      let toolName = cfg('UTMIFY_MCP_TOOL');
      if (!toolName) {
        const { tools = [] } = (await client.listTools()) || {};
        const score = (t) => {
          const s = `${t.name} ${t.description || ''}`.toLowerCase();
          return (/dashboard|resumo|summary|metric|report|overview|faturamento|analytic/.test(s) ? 2 : 0)
            + (/order|venda|sale/.test(s) ? 1 : 0);
        };
        toolName = tools.slice().sort((a, b) => score(b) - score(a))[0]?.name;
      }
      if (!toolName) return json(res, 502, { error: 'nenhuma_ferramenta', hint: 'Rode op=discover e defina UTMIFY_MCP_TOOL.' });

      let args = { startDate: date, endDate: date, date, start: date, end: date, timezone: TZ };
      if (cfg('UTMIFY_MCP_ARGS')) {
        try { args = JSON.parse(cfg('UTMIFY_MCP_ARGS').replaceAll('{date}', date)); } catch { /* mantém padrão */ }
      }

      const parsed = unwrapToolResult(await client.callTool(toolName, args));
      if (!parsed) return json(res, 502, { error: 'resposta_vazia', tool: toolName });

      const readField = (envKey, aliases) => {
        const path = cfg(envKey);
        if (path) { const v = dig(parsed, path); if (v != null) return toNum(v); }
        const found = findNumber(parsed, aliases);
        return found == null ? null : found;
      };

      const revenue = readField('UTMIFY_FIELD_REVENUE', ALIAS.revenue) ?? 0;
      const adSpend = readField('UTMIFY_FIELD_ADSPEND', ALIAS.adSpend) ?? 0;
      let otherCost = readField('UTMIFY_FIELD_OTHER', ALIAS.otherCost) ?? 0;
      const profit = readField('UTMIFY_FIELD_PROFIT', ALIAS.profit);
      // Se o lucro veio pronto, deriva "outros custos" para o total fechar.
      if (profit != null && revenue) {
        const derived = revenue - adSpend - profit;
        if (derived > 0.01) otherCost = derived;
      }
      rows = [{ date, revenue, adSpend, otherCost, tool: toolName }];
    } catch (e) {
      return json(res, 502, { error: 'mcp_falhou', detail: String(e.message || e) });
    }
  } else if (cfg('UTMIFY_METRICS_URL') && cfg('UTMIFY_TOKEN')) {
    via = 'rest';
    const date = String(body.targetDate || todayBR()).slice(0, 10);
    const target = cfg('UTMIFY_METRICS_URL')
      .replaceAll('{date}', date).replaceAll('{start}', date).replaceAll('{end}', date);
    try {
      const r = await fetch(target, {
        headers: {
          'x-api-token': cfg('UTMIFY_TOKEN'),
          Authorization: `Bearer ${cfg('UTMIFY_TOKEN')}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      if (!r.ok) return json(res, 502, { error: 'utmify_falhou', status: r.status });
      const payload = await r.json();
      rows = [{
        date,
        revenue: toNum(dig(payload, cfg('UTMIFY_FIELD_REVENUE') || '') ?? findNumber(payload, ALIAS.revenue)),
        adSpend: toNum(dig(payload, cfg('UTMIFY_FIELD_ADSPEND') || '') ?? findNumber(payload, ALIAS.adSpend)),
        otherCost: toNum(dig(payload, cfg('UTMIFY_FIELD_OTHER') || '') ?? findNumber(payload, ALIAS.otherCost)),
      }];
    } catch (e) {
      return json(res, 502, { error: 'utmify_inacessivel', detail: String(e.message || e) });
    }
  } else {
    return json(res, 200, {
      ok: false,
      skipped: 'sem_configuracao',
      hint: 'Defina UTMIFY_MCP_URL (recomendado) ou UTMIFY_METRICS_URL+UTMIFY_TOKEN, ou envie um POST com x-ingest-token e {date,revenue,adSpend}.',
    });
  }

  const applied = [];
  await updateDb((db) => {
    for (const r of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
      let day = db.metrics.find((f) => f.date === r.date);
      if (!day) { day = { date: r.date, createdAt: new Date().toISOString() }; db.metrics.push(day); }
      Object.assign(day, {
        revenue: r.revenue, adSpend: r.adSpend, otherCost: r.otherCost,
        source: 'utmify', updatedAt: new Date().toISOString(), updatedBy: 'utmify',
      });
      applied.push(day);
    }
    db.metrics.sort((a, b) => (a.date < b.date ? 1 : -1));
    db.settings.utmifyLastSync = new Date().toISOString();
    if (applied.length) {
      const d = applied[0];
      const profit = d.revenue - d.adSpend - (d.otherCost || 0);
      logActivity(db, actor, {
        pillar: 'trafego', entity: 'metrica', entityId: d.date, action: 'sync',
        message: `UTMify (${via}) sincronizou ${d.date}: faturamento ${fmt(d.revenue)}, ads ${fmt(d.adSpend)}, lucro ${fmt(profit)}`,
      });
      if (actor.id === 'system') {
        notify(db, actor, {
          message: `📊 UTMify atualizou ${d.date} — lucro do dia ${fmt(profit)}`,
          kind: profit >= 0 ? 'good' : 'critical',
          link: '#/trafego',
        });
      }
    }
  });

  return json(res, 200, { ok: true, via, applied: applied.length, days: applied.map((d) => d.date) });
}

const fmt = (n) => `R$ ${(n || 0).toFixed(2)}`;

export default withErrors(handler);
