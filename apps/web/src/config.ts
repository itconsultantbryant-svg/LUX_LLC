import { PRODUCT, AppEnvSchema, type AppEnv } from '@healthwallet/shared';

const rawEnv = import.meta.env.VITE_APP_ENV ?? 'development';
const parsed = AppEnvSchema.safeParse(rawEnv);

export const webConfig = {
  appEnv: (parsed.success ? parsed.data : 'development') as AppEnv,
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
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
