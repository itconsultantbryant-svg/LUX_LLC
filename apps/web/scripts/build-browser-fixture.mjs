// Self-contained browser fixture for environments where Chrome cannot reach localhost.
// Exercises the real React components with MemoryRouter; never deploy this fixture.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite'))('esbuild');
const root = fileURLToPath(new URL('..', import.meta.url));
const result = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {App} from './src/App';import './src/styles/global.css';createRoot(document.getElementById('root')).render(<MemoryRouter><App/></MemoryRouter>);`,
    loader: 'tsx',
    resolveDir: root,
  },
  bundle: true,
  write: false,
  outdir: '/tmp/lux-fixture',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{"VITE_APP_ENV":"demo"}' },
});
const logo = (await readFile(`${root}/public/lux-ai-logo.png`)).toString('base64');
const js = result.outputFiles
  .find((file) => file.path.endsWith('.js'))
  .text.replaceAll('"/lux-ai-logo.png"', `"data:image/png;base64,${logo}"`)
  .replaceAll('</script', '<\\/script');
const css = result.outputFiles.find((file) => file.path.endsWith('.css')).text;
await writeFile(
  '/tmp/lux-design-fixture.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`,
);
console.log('Wrote /tmp/lux-design-fixture.html');
