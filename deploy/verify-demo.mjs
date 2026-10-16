#!/usr/bin/env node
//
// Smoke-verify a running, clearly labelled demo of HealthWallet Liberia.
//
// It exercises only the public surface through the same origin the browser (and,
// in production, the Vercel Edge Middleware) uses. Authenticated journeys are
// covered by `pnpm test:journey`, which drives the full HTTP stack.
//
// Usage: node deploy/verify-demo.mjs http://127.0.0.1:5173
//
const base = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
const results = [];
let failures = 0;

function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push({ check: name, ok, detail });
}

async function get(path) {
  const response = await fetch(base + path, { redirect: 'manual' });
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* not json */
  }
  return { status: response.status, body };
}

const health = await get('/health');
check('health reachable through web origin', health.status === 200, `status=${health.status}`);
check('health reports ok', health.body?.status === 'ok');
check('demo is a simulation environment', health.body?.simulation === true);
for (const adapter of ['ai', 'payments', 'messaging']) {
  check(
    `${adapter} adapter is sandbox`,
    health.body?.adapters?.[adapter]?.mode === 'sandbox',
    health.body?.adapters?.[adapter]?.mode,
  );
}

const ready = await get('/ready');
check('ready reports database ok', ready.status === 200 && ready.body?.database === true);

const meta = await get('/api/meta');
check('product meta is served', meta.status === 200 && Boolean(meta.body?.product?.name));
check(
  'unresolved product questions are surfaced',
  (meta.body?.unresolvedQuestions?.length ?? 0) > 0,
);

const fees = await get('/api/fees');
check('fee schedule is served without a session', fees.status === 200, `status=${fees.status}`);

const wallet = await get('/api/wallet');
check(
  'protected endpoints reject anonymous access',
  wallet.status === 401 || wallet.status === 403,
  `status=${wallet.status}`,
);

const extract = await fetch(base + '/api/ai/sandbox-extract', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hintText: 'demo' }),
});
check(
  'sandbox extraction endpoint exists and requires a session',
  extract.status === 401 || extract.status === 403,
  `status=${extract.status}`,
);

const report = {
  base,
  verifiedAt: new Date().toISOString(),
  passed: results.filter((r) => r.ok).length,
  failed: failures,
  results,
};
console.log(JSON.stringify(report, null, 2));
process.exit(failures === 0 ? 0 : 1);
