// Servidor de desenvolvimento: compila o React em watch e serve a API igual à Vercel.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2',
};

await build({ watch: true, minify: false });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const name = pathname.slice(5).replace(/\/+$/, '');
    const file = path.join(ROOT, 'api', `${name}.js`);
    try { await fs.access(file); } catch {
      res.statusCode = 404; return res.end(JSON.stringify({ error: 'rota_nao_encontrada' }));
    }
    try {
      const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
      await mod.default(req, res);
    } catch (e) {
      console.error('[api]', name, e);
      if (!res.headersSent) res.statusCode = 500;
      res.end(JSON.stringify({ error: 'erro_interno', detail: String(e.message || e) }));
    }
    return;
  }

  // arquivos estáticos, com fallback de SPA
  const candidate = path.join(ROOT, 'public', path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  let filePath = candidate;
  try {
    const st = await fs.stat(candidate);
    if (st.isDirectory()) filePath = path.join(candidate, 'index.html');
  } catch {
    filePath = path.join(ROOT, 'public', 'index.html');
  }
  try {
    const buf = await fs.readFile(filePath);
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end('404');
  }
});

server.listen(PORT, () => console.log(`\n▶ http://localhost:${PORT}\n`));
