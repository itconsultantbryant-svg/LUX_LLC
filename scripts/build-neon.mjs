import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const folder = '/tmp/lux-neon-security';
await mkdir(folder, { recursive: true });
await build({
  entryPoints: ['apps/api/src/neon.ts'],
  outfile: `${folder}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: ['pg-native'],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
execFileSync('/usr/bin/zip', ['-q', 'function.zip', 'index.mjs'], { cwd: folder });
console.log(`Neon development bundle: ${folder}/function.zip`);
