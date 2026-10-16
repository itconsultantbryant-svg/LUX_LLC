import { z } from 'zod';

export const AppEnvSchema = z.enum(['development', 'test', 'demo', 'production']);
export type AppEnv = z.infer<typeof AppEnvSchema>;

export const AdapterModeSchema = z.enum(['sandbox', 'live']);
export type AdapterMode = z.infer<typeof AdapterModeSchema>;

export const PRODUCT = {
  name: 'HealthWallet Liberia',
  aiEngine: 'LUX HealthTrust',
  operator: 'LUX AI',
  intendedPartner: 'Orange Liberia',
} as const;
