// ---------------------------------------------------------------------------
// Cliente MCP mínimo (Streamable HTTP) — sem dependências.
// Usado para falar com o servidor MCP da UTMify e puxar as métricas do dia.
// ---------------------------------------------------------------------------

const PROTOCOL = '2025-06-18';

function parseBody(text, contentType = '') {
  // O transporte pode responder em JSON puro ou em SSE (event: message / data: {...})
  if (contentType.includes('text/event-stream') || text.startsWith('event:') || text.includes('\ndata:')) {
    const frames = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try { frames.push(JSON.parse(raw)); } catch { /* ignora frame parcial */ }
      }
    }
    return frames.find((f) => f.result || f.error) || frames[frames.length - 1] || null;
  }
  try { return JSON.parse(text); } catch { return null; }
}

export function createMcpClient(url, { timeoutMs = 20000, headers: extra = {} } = {}) {
  let sessionId = null;
  let nextId = 1;

  async function send(method, params, { notification = false } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL,
        ...extra,
      };
      if (sessionId) headers['mcp-session-id'] = sessionId;

      const body = notification
        ? { jsonrpc: '2.0', method, params }
        : { jsonrpc: '2.0', id: nextId++, method, params };

      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
      const sid = r.headers.get('mcp-session-id');
      if (sid) sessionId = sid;
      if (notification) return null;

      const text = await r.text();
      if (!r.ok) {
        const err = new Error(`MCP HTTP ${r.status}: ${text.slice(0, 300)}`);
        err.status = r.status;
        throw err;
      }
      const msg = parseBody(text, r.headers.get('content-type') || '');
      if (!msg) throw new Error('Resposta MCP ilegível');
      if (msg.error) throw new Error(`MCP ${msg.error.code}: ${msg.error.message}`);
      return msg.result;
    } finally {
      clearTimeout(t);
    }
  }

  return {
    get sessionId() { return sessionId; },
    async initialize() {
      const res = await send('initialize', {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'controle-operacao', version: '1.0.0' },
      });
      await send('notifications/initialized', {}, { notification: true }).catch(() => {});
      return res;
    },
    listTools: () => send('tools/list', {}),
    listResources: () => send('resources/list', {}).catch(() => ({ resources: [] })),
    callTool: (name, args = {}) => send('tools/call', { name, arguments: args }),
    readResource: (uri) => send('resources/read', { uri }),
  };
}

/** Extrai um objeto JSON do retorno de tools/call (structuredContent ou texto). */
export function unwrapToolResult(result) {
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;
  const parts = Array.isArray(result.content) ? result.content : [];
  for (const p of parts) {
    if (p.type === 'text' && p.text) {
      const t = p.text.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try { return JSON.parse(t); } catch { /* segue */ }
      }
    }
  }
  const texts = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  return texts ? { text: texts } : null;
}

/** Busca profunda pela primeira chave numérica que bata com um dos aliases. */
export function findNumber(obj, aliases, depth = 0) {
  if (obj == null || depth > 6) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const v = findNumber(item, aliases, depth + 1);
      if (v != null) return v;
    }
    return null;
  }
  if (typeof obj !== 'object') return null;
  for (const key of Object.keys(obj)) {
    const norm = key.toLowerCase().replace(/[^a-z]/g, '');
    if (aliases.includes(norm)) {
      const raw = obj[key];
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  for (const key of Object.keys(obj)) {
    const v = findNumber(obj[key], aliases, depth + 1);
    if (v != null) return v;
  }
  return null;
}

export const dig = (obj, path) =>
  String(path || '').split('.').filter(Boolean)
    .reduce((acc, k) => (acc == null ? undefined : acc[/^\d+$/.test(k) ? Number(k) : k]), obj);
