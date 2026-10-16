import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  functions: {
    healthwallet: {
      name: 'HealthWallet Liberia development API',
      source: 'apps/api/src/neon.ts',
      env: {
        APP_ENV: 'development',
        AI_ADAPTER: 'sandbox',
        PAYMENT_ADAPTER: 'sandbox',
        MESSAGING_ADAPTER: 'sandbox',
        PHONE_VERIFICATION_PROVIDER: 'sandbox',
        SECURITY_ENCRYPTION_KEY: process.env.SECURITY_ENCRYPTION_KEY!,
        STORAGE_ADAPTER: 's3',
        S3_ENDPOINT: process.env.S3_ENDPOINT!,
        S3_REGION: process.env.S3_REGION!,
        S3_BUCKET: process.env.S3_BUCKET!,
        S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID!,
        S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY!,
        STORAGE_LOCAL_ROOT: '/tmp/healthwallet-sandbox',
        CORS_ORIGIN:
          'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174',
        DEFAULT_CURRENCY: 'LRD',
        ORIGIN_SECRET: process.env.ORIGIN_SECRET!,
      },
    },
  },
});
