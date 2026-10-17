import { PRODUCT, AppEnvSchema, type AppEnv } from '@healthwallet/shared';

const rawEnv = import.meta.env.VITE_APP_ENV ?? 'development';
const parsed = AppEnvSchema.safeParse(rawEnv);

// Every API path in this app already starts with /api (e.g. /api/wallet), so the
// base URL must be the origin only. Strip trailing slashes and a trailing /api
// so a misconfigured VITE_API_BASE_URL cannot produce /api/api/... requests.
export function normalizeApiBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  let base = value.replace(/\/+$/, '');
  if (base.endsWith('/api')) base = base.slice(0, -'/api'.length).replace(/\/+$/, '');
  return base;
}

export const webConfig = {
  appEnv: (parsed.success ? parsed.data : 'development') as AppEnv,
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined),
  productName: (import.meta.env.VITE_PRODUCT_NAME as string | undefined) ?? PRODUCT.name,
  aiEngine: (import.meta.env.VITE_AI_ENGINE as string | undefined) ?? PRODUCT.aiEngine,
  operator: PRODUCT.operator,
  intendedPartner: PRODUCT.intendedPartner,
};

export function isDemoLike(env: AppEnv = webConfig.appEnv): boolean {
  return env === 'development' || env === 'test' || env === 'demo';
}

export function isDemoDeployment(env: AppEnv = webConfig.appEnv): boolean {
  return env === 'demo';
}
