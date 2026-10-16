import { SandboxFundingAdapter, type FundingAdapter } from './funding.js';
import { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStorageAdapter } from './storage.s3.js';
import type { Env } from '../config/env.js';
import { SandboxAiAdapter } from './ai.sandbox.js';
import { TwilioMessagingAdapter } from './messaging.twilio.js';
import { SandboxMessagingAdapter } from './messaging.sandbox.js';
import { SandboxPaymentAdapter } from './payment.sandbox.js';
import { SandboxInsuranceAdapter } from './insurance.sandbox.js';
import { SandboxUssdAdapter } from './ussd.sandbox.js';
import { LocalObjectStorageAdapter } from './storage.local.js';
import type {
  AiAdapter,
  InsuranceAdapter,
  MessagingAdapter,
  ObjectStorageAdapter,
  PaymentAdapter,
  UssdAdapter,
} from './types.js';

export interface Adapters {
  ai: AiAdapter;
  payments: PaymentAdapter;
  funding: FundingAdapter;
  messaging: MessagingAdapter;
  storage: ObjectStorageAdapter;
  insurance: InsuranceAdapter;
  ussd: UssdAdapter;
}

export function createAdapters(env: Env): Adapters {
  if (env.AI_ADAPTER === 'live') {
    throw new Error(
      'Live AI adapter is not configured. Keep AI_ADAPTER=sandbox until LUX HealthTrust live credentials exist.',
    );
  }
  if (env.PAYMENT_ADAPTER === 'live') {
    throw new Error(
      'Live payment adapter is not configured. Keep PAYMENT_ADAPTER=sandbox until Orange Money interfaces are confirmed.',
    );
  }
  if (
    env.PHONE_VERIFICATION_PROVIDER === 'twilio' &&
    (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER)
  )
    throw new Error('Twilio verification credentials are required.');
  if (env.MESSAGING_ADAPTER === 'live' && env.PHONE_VERIFICATION_PROVIDER !== 'twilio') {
    throw new Error(
      'Live messaging adapter is not configured. Keep MESSAGING_ADAPTER=sandbox until an approved gateway exists.',
    );
  }
  if (
    env.STORAGE_ADAPTER === 's3' &&
    (!env.S3_ENDPOINT ||
      !env.S3_REGION ||
      !env.S3_BUCKET ||
      !env.S3_ACCESS_KEY_ID ||
      !env.S3_SECRET_ACCESS_KEY)
  ) {
    throw new Error(
      'Private storage requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
    );
  }

  return {
    ai: new SandboxAiAdapter(),
    payments: new SandboxPaymentAdapter(env.PAYMENT_CALLBACK_SECRET),
    funding: new SandboxFundingAdapter(),
    messaging:
      env.PHONE_VERIFICATION_PROVIDER === 'twilio'
        ? new TwilioMessagingAdapter(
            env.TWILIO_ACCOUNT_SID!,
            env.TWILIO_AUTH_TOKEN!,
            env.TWILIO_FROM_NUMBER!,
          )
        : new SandboxMessagingAdapter(),
    storage:
      env.STORAGE_ADAPTER === 's3'
        ? new S3ObjectStorageAdapter(
            new S3Client({
              endpoint: env.S3_ENDPOINT!,
              region: env.S3_REGION!,
              forcePathStyle: true,
              credentials: {
                accessKeyId: env.S3_ACCESS_KEY_ID!,
                secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
              },
              maxAttempts: 2,
              requestChecksumCalculation: 'WHEN_REQUIRED',
              responseChecksumValidation: 'WHEN_REQUIRED',
            }),
            env.S3_BUCKET!,
          )
        : new LocalObjectStorageAdapter(env.STORAGE_LOCAL_ROOT),
    insurance: new SandboxInsuranceAdapter(),
    ussd: new SandboxUssdAdapter(env.USSD_SANDBOX_ENABLED),
  };
}

export type * from './types.js';
