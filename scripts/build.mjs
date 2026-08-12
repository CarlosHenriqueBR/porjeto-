import * as esbuild from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'build');

export const buildOptions = {
  entryPoints: [path.join(ROOT, 'src/main.tsx')],
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'],
  jsx: 'automatic',
  outdir: OUT,
  entryNames: 'app',
  assetNames: '[name]',
  loader: { '.woff2': 'file', '.png': 'file', '.svg': 'dataurl' },
  alias: { '@': path.join(ROOT, 'src') },
  logLevel: 'info',
};

export async function build({ watch = false, minify = true } = {}) {
  await fs.mkdir(OUT, { recursive: true });
  // Sem este define o React entra no bundle em modo de desenvolvimento:
  // avisos extras, checagens caras e ~40% a mais de peso.
  const mode = minify ? 'production' : 'development';
  const opts = {
    ...buildOptions,
    minify,
    sourcemap: !minify,
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
  };
  if (!watch) {
    await esbuild.build(opts);
    return null;
  }
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  return ctx;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await build({ minify: true });
  console.log('✔ build gerado em public/build');
}
