import type {
  AdapterMode,
  AiExtractionResult,
  PaymentCallbackStatus,
  PaymentState,
} from '@healthwallet/shared';

export interface AiAdapter {
  readonly id: string;
  readonly mode: AdapterMode;
  extractFromDocument(input: {
    storageKey: string;
    contentType: string;
    /** Raw document bytes. Adapters must read the document itself, never a fixture. */
    bytes?: Buffer;
    hintText?: string;
  }): Promise<AiExtractionResult>;
}

export interface PaymentChargeInput {
  amountMinor: string;
  currency: string;
  idempotencyKey: string;
  narrative: string;
}

export interface PaymentChargeResult {
  mode: AdapterMode;
  status: 'succeeded' | 'failed' | 'pending';
  adapterReference: string;
  simulationLabel?: string;
  raw: Record<string, unknown>;
}

/** Lifecycle initiation shared by deposits and provider payments. */
export interface PaymentInitiationInput {
  reference: string;
  amountMinor: string;
  currency: string;
  idempotencyKey: string;
  narrative: string;
  payer?: string;
  payee?: string;
}

export interface PaymentProviderResult {
  mode: AdapterMode;
  state: Extract<PaymentState, 'submitted' | 'pending' | 'succeeded' | 'failed' | 'expired'>;
  adapterReference: string;
  simulationLabel?: string;
  raw: Record<string, unknown>;
}

export interface PaymentRefundInput {
  reference: string;
  adapterReference: string | null;
  amountMinor: string;
  currency: string;
  idempotencyKey: string;
  reason: string;
}

export interface PaymentCallbackVerificationInput {
  rawBody: Buffer;
  signature: string | null;
}

export interface VerifiedPaymentCallback {
  valid: boolean;
  reason?: string;
  event?: {
    provider: string;
    eventId: string;
    reference: string;
    status: PaymentCallbackStatus;
    sequence: number;
    amountMinor: string;
    currency: string;
    occurredAt: string;
    reason?: string;
  };
}

export interface PaymentAdapter {
  readonly id: string;
  readonly mode: AdapterMode;
  charge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
  /** Provider-initiated lifecycle methods. Absent methods fail closed. */
  initiateDeposit?(input: PaymentInitiationInput): Promise<PaymentProviderResult>;
  initiatePayment?(input: PaymentInitiationInput): Promise<PaymentProviderResult>;
  getStatus?(input: {
    reference: string;
    adapterReference: string | null;
  }): Promise<PaymentProviderResult>;
  refund?(input: PaymentRefundInput): Promise<PaymentProviderResult>;
  verifyCallback?(input: PaymentCallbackVerificationInput): VerifiedPaymentCallback;
  /** Sandbox/test helper: sign a raw body exactly as the provider would. */
  signCallback?(rawBody: Buffer): string;
}

export interface MessagingAdapter {
  readonly id: string;
  readonly mode: AdapterMode;
  send(input: {
    to: string;
    channel: 'sms' | 'ussd' | 'whatsapp' | 'email';
    body: string;
  }): Promise<{ accepted: boolean; simulationLabel?: string }>;
}

/** Verified insurance coverage. Coverage is only ever reported from a verifier. */
export interface InsuranceCoverageResult {
  verified: boolean;
  reason: string;
  policyNumber: string | null;
  status: 'active' | 'lapsed' | 'cancelled' | null;
  validFrom: string | null;
  validTo: string | null;
  coverage: Record<string, unknown>;
  simulationLabel?: string;
}

export interface InsuranceClaimPreparationResult {
  accepted: boolean;
  state: 'submitted' | 'insurer_review' | 'failed';
  reference: string | null;
  simulationLabel?: string;
  raw: Record<string, unknown>;
}

export interface InsuranceAdapter {
  readonly id: string;
  readonly mode: AdapterMode;
  /** Absent verification capability means coverage is reported unavailable. */
  verifyCoverage?(input: {
    beneficiaryUserId: string;
    policyNumber: string | null;
    insurerReference: string | null;
  }): Promise<InsuranceCoverageResult>;
  prepareClaim?(input: {
    policyNumber: string;
    billId: string;
    amountMinor: string;
    currency: string;
    idempotencyKey: string;
  }): Promise<InsuranceClaimPreparationResult>;
  getClaimStatus?(input: { reference: string }): Promise<InsuranceClaimPreparationResult>;
}

export interface UssdScreen {
  continue: boolean;
  screen: string;
  state: Record<string, unknown>;
}

/**
 * USSD/feature-phone adapter. Reports whether it is provisioned; an
 * unprovisioned adapter keeps the module explicitly unavailable rather than
 * displaying a dial code that does not work.
 */
export interface UssdAdapter {
  readonly id: string;
  readonly mode: AdapterMode;
  readonly provisioned: boolean;
  handleSession(input: {
    sessionCode: string;
    phone: string;
    input: string;
    state: Record<string, unknown>;
  }): Promise<UssdScreen>;
}

export interface StoredObject {
  key: string;
  contentType: string;
  byteSize: number;
}

export interface ObjectStorageAdapter {
  readonly id: string;
  readonly mode: AdapterMode;
  putObject(input: { key: string; bytes: Buffer; contentType: string }): Promise<StoredObject>;
  getSignedReadUrl(key: string, expiresSeconds: number): Promise<string>;
  readObject?(key: string): Promise<Buffer>;
  deleteObject?(key: string): Promise<void>;
}
