// Offline preflight: no credentials are printed and no external state is changed.
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
const path = process.argv[2];
if (!path)
  throw new Error('Usage: node scripts/check-production.mjs /path/to/production.env.local');
const env = parse(readFileSync(path));
const problems = [];
function requireValue(name, test = (value) => !!value && !/REPLACE|\.\.\./.test(value)) {
  if (!test(env[name] ?? '')) problems.push(name);
}
requireValue('APP_ENV', (v) => v === 'production');
requireValue('PHONE_VERIFICATION_PROVIDER', (v) => v === 'twilio');
requireValue('MESSAGING_ADAPTER', (v) => v === 'live');
requireValue('TWILIO_ACCOUNT_SID', (v) => /^AC[a-f0-9]{32}$/i.test(v));
requireValue('TWILIO_AUTH_TOKEN', (v) => v.length >= 20 && !v.includes('REPLACE'));
requireValue('TWILIO_FROM_NUMBER', (v) => /^\+[1-9]\d{7,14}$/.test(v));
requireValue('SECURITY_ENCRYPTION_KEY', (v) => /^[a-f0-9]{64}$/i.test(v));
requireValue('PAYMENT_CALLBACK_SECRET', (v) => v.length >= 16 && !v.includes('REPLACE'));
requireValue('ORIGIN_SECRET', (v) => v.length >= 32 && !v.includes('REPLACE'));
requireValue('STORAGE_ADAPTER', (v) => v === 's3');
for (const name of ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])
  requireValue(name);
function httpsOrigin(v) {
  try {
    const u = new URL(v);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      u.origin === v &&
      !/localhost|127\.0\.0\.1|REPLACE/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}
requireValue('S3_ENDPOINT', httpsOrigin);
requireValue('CORS_ORIGIN', (v) => !!v && v.split(',').every(httpsOrigin));
requireValue('DATABASE_URL', (v) => {
  try {
    const u = new URL(v);
    return (
      ['postgres:', 'postgresql:'].includes(u.protocol) &&
      u.hostname.endsWith('.neon.tech') &&
      ['require', 'verify-full'].includes(u.searchParams.get('sslmode')) &&
      !/REPLACE|_test|_dev/.test(v)
    );
  } catch {
    return false;
  }
});
if (problems.length) {
  console.error('Production setup incomplete. Missing or invalid settings: ' + problems.join(', '));
  process.exitCode = 1;
} else
  console.log(
    'Configuration preflight passed. Verify live SMS, private storage, HTTPS proxy and administrator MFA before opening access.',
  );
