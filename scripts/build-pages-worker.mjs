import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outdir = path.join(repoRoot, 'frontend/dist');
const chunkDir = path.join(outdir, '_worker-chunks');

await mkdir(outdir, { recursive: true });
await rm(chunkDir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(repoRoot, 'worker/src/index.js')],
  outdir,
  entryNames: '_worker',
  chunkNames: '_worker-chunks/[name]-[hash]',
  bundle: true,
  format: 'esm',
  platform: 'node',
  conditions: ['workerd'],
  target: 'es2022',
  splitting: true,
  minify: true,
});

console.log(`Built Pages Worker: ${path.relative(repoRoot, path.join(outdir, '_worker.js'))}`);
