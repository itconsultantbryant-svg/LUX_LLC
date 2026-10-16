import { z } from 'zod';
import type { RoleCode } from './roles.js';

export const CONSENT_VERSION = 'sandbox-v1';
export const LIVE_CONSENT_VERSION = 'v1';
export const ConsentTypeSchema = z.enum(['service_terms', 'health_data']);
export const RequestOtpSchema = z
  .object({
    phone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, for example +231770000000.'),
  })
  .strict();
export const VerifyOtpSchema = z
  .object({
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{6}$/, 'Enter the six-digit code.'),
    consentVersion: z.enum([CONSENT_VERSION, LIVE_CONSENT_VERSION]),
    serviceTerms: z.literal(true),
    healthData: z.literal(true),
  })
  .strict();
export const RecordConsentSchema = z
  .object({
    consentType: ConsentTypeSchema,
    version: z.enum([CONSENT_VERSION, LIVE_CONSENT_VERSION]),
    granted: z.boolean(),
  })
  .strict();

export interface IdentityProfile {
  id: string;
  phone: string;
  roles: RoleCode[];
  consents: Array<{
    consentType: z.infer<typeof ConsentTypeSchema>;
    granted: boolean;
    version: string;
    createdAt: string;
  }>;
}

export interface OtpChallengeResponse {
  challengeId: string;
  expiresAt: string;
  sandboxCode?: string;
  simulation: boolean;
}
