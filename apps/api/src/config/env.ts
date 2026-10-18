import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { AdapterModeSchema, AppEnvSchema } from '@healthwallet/shared';

loadDotenv();

const EnvSchema = z
  .object({
    APP_ENV: AppEnvSchema.default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    AI_ADAPTER: AdapterModeSchema.default('sandbox'),
    PAYMENT_ADAPTER: AdapterModeSchema.default('sandbox'),
    MESSAGING_ADAPTER: AdapterModeSchema.default('sandbox'),
    PHONE_VERIFICATION_PROVIDER: z.enum(['sandbox', 'twilio']).default('sandbox'),
    TWILIO_ACCOUNT_SID: z
      .string()
      .regex(/^AC[a-fA-F0-9]{32}$/)
      .optional(),
    TWILIO_AUTH_TOKEN: z.string().min(20).optional(),
    TWILIO_FROM_NUMBER: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
    SECURITY_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
    STORAGE_ADAPTER: z.enum(['local', 's3']).default('local'),
    S3_ENDPOINT: z
      .url()
      .refine(
        (v) => new URL(v).protocol === 'https:' && !new URL(v).username && !new URL(v).password,
        'Use an HTTPS storage endpoint without credentials',
      )
      .optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    STORAGE_LOCAL_ROOT: z.string().default('./storage'),
    DEFAULT_CURRENCY: z.string().length(3).default('LRD'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    PAYMENT_CALLBACK_SECRET: z.string().min(16).optional(),
    /** Signs short-lived, actor-bound document download links. Required for
     * production downloads; falls back to SECURITY_ENCRYPTION_KEY when unset. */
    DOWNLOAD_LINK_SECRET: z.string().min(16).optional(),
    DOWNLOAD_LINK_TTL_SECONDS: z.coerce.number().int().min(15).max(3600).default(120),
    /** Global mutation rate limit (requests per window per client IP). */
    RATE_LIMIT_MUTATIONS: z.coerce.number().int().min(1).max(100000).default(600),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(30).max(86400).default(900),
    /** Data-retention windows in days. Financial ledgers, journals, receipts,
     * settlements, disputes and audit events are never purged by the job. */
    RETENTION_SESSION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    RETENTION_OTP_DAYS: z.coerce.number().int().min(1).max(365).default(2),
    RETENTION_IDENTITY_LIMIT_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    RETENTION_AI_ARTIFACT_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
    RETENTION_DOCUMENT_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
    RETENTION_AUDIT_DAYS: z.coerce.number().int().min(30).max(36500).default(2555),
    /** Enables the sandbox USSD menu. Off by default so the module is honestly unavailable. */
    USSD_SANDBOX_ENABLED: z.coerce.boolean().default(false),
    /** Password for the platform-admin sign-in button. Only honoured outside
     * production, where administrators sign in with a verified phone and MFA. */
    ADMIN_PASSWORD: z.string().min(8).max(200).default('admin@LUX231'),
    /** Which platform-admin account the password button signs in as. Falls back
     * to the earliest platform administrator when unset. */
    ADMIN_PHONE: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.APP_ENV === 'production') {
      if (value.PAYMENT_ADAPTER === 'live' && !process.env.ORANGE_MONEY_CLIENT_ID) {
        ctx.addIssue({
          code: 'custom',
          message:
            'PAYMENT_ADAPTER=live in production requires partner credentials (e.g. ORANGE_MONEY_CLIENT_ID). Use sandbox until issued.',
          path: ['PAYMENT_ADAPTER'],
        });
      }
      if (!value.PAYMENT_CALLBACK_SECRET) {
        ctx.addIssue({
          code: 'custom',
          message:
            'PAYMENT_CALLBACK_SECRET is required in production to verify provider callbacks.',
          path: ['PAYMENT_CALLBACK_SECRET'],
        });
      }
      if (!value.DOWNLOAD_LINK_SECRET && !value.SECURITY_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: 'custom',
          message:
            'DOWNLOAD_LINK_SECRET (or SECURITY_ENCRYPTION_KEY) is required in production to sign document download links.',
          path: ['DOWNLOAD_LINK_SECRET'],
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export function isSimulationEnvironment(appEnv: Env['APP_ENV']): boolean {
  return appEnv === 'development' || appEnv === 'test' || appEnv === 'demo';
}
