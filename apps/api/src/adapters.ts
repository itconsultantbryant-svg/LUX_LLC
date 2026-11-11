import { DomainError, parseAI } from "../../../packages/domain/index.ts";
export interface PaymentResult {
  eventId: string;
  reference: string;
  paymentId: string;
  currency: string;
  amountMinor: string;
  destination: string;
  outcome:
    | "SETTLED"
    | "FAILED"
    | "UNKNOWN_PENDING_INVESTIGATION"
    | "AWAITING_FUNDS"
    | "REVERSED";
}
export interface PaymentAdapter {
  capabilities: {
    initiateBusinessPayment: boolean;
    getPaymentStatus: boolean;
    verifyIncomingEvent: boolean;
    fetchSettlementReport: boolean;
  };
  initiate(payment: any): Promise<PaymentResult>;
  status(payment: any): Promise<PaymentResult>;
  verify(
    body: unknown,
    headers: Record<string, unknown>,
  ): Promise<PaymentResult>;
}
export class DemoPaymentAdapter implements PaymentAdapter {
  capabilities = {
    initiateBusinessPayment: true,
    getPaymentStatus: true,
    verifyIncomingEvent: false,
    fetchSettlementReport: false,
  };
  async initiate(payment: any): Promise<PaymentResult> {
    const scenario = payment.destination_snapshot.scenario || "success";
    return {
      eventId: `demo-${payment.id}-${scenario}`,
      reference: `DEMO-${payment.id}`,
      paymentId: payment.id,
      currency: payment.currency,
      amountMinor: payment.base_minor,
      destination: payment.destination_snapshot.reference,
      outcome:
        scenario === "timeout"
          ? "UNKNOWN_PENDING_INVESTIGATION"
          : scenario === "funds"
            ? "AWAITING_FUNDS"
            : scenario === "failure"
              ? "FAILED"
              : "SETTLED",
    };
  }
  async status(payment: any): Promise<PaymentResult> {
    return {
      ...(await this.initiate(payment)),
      eventId: `demo-${payment.id}-confirmed`,
      outcome:
        payment.state === "AWAITING_FUNDS" ? "AWAITING_FUNDS" : "SETTLED",
    };
  }
  async verify(): Promise<PaymentResult> {
    throw new DomainError("DEMO_HAS_NO_EXTERNAL_WEBHOOK", 503);
  }
}
export class UnconfiguredPaymentAdapter implements PaymentAdapter {
  capabilities = {
    initiateBusinessPayment: false,
    getPaymentStatus: false,
    verifyIncomingEvent: false,
    fetchSettlementReport: false,
  };
  async initiate(): Promise<PaymentResult> {
    throw new DomainError("BUSINESS_PAYMENT_CAPABILITY_UNAVAILABLE", 503);
  }
  async status(): Promise<PaymentResult> {
    throw new DomainError("PROVIDER_STATUS_UNAVAILABLE", 503);
  }
  async verify(): Promise<PaymentResult> {
    throw new DomainError("WEBHOOK_VERIFICATION_UNCONFIGURED", 503);
  }
}
export function paymentAdapter(mode: string): PaymentAdapter {
  return mode === "demo"
    ? new DemoPaymentAdapter()
    : new UnconfiguredPaymentAdapter();
}
export async function assistValidation(_authorizedSnapshot: unknown) {
  // Deliberately no document instructions, tools, network fetches or clinical inference.
  return parseAI({ findings: [] });
}
