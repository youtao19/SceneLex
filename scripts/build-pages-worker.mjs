import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outfile = path.join(repoRoot, 'frontend/dist/_worker.js');

await mkdir(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(repoRoot, 'worker/src/index.js')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  conditions: ['workerd'],
  target: 'es2022',
  minify: true,
});

console.log(`Built Pages Worker: ${path.relative(repoRoot, outfile)}`);
