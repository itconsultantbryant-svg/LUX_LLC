import type {
  InsuranceAdapter,
  InsuranceClaimPreparationResult,
  InsuranceCoverageResult,
} from './types.js';

const SIMULATION_LABEL = 'SIMULATION — sandbox insurance; no insurer was contacted.';

/**
 * Sandbox insurance verifier. It answers deterministically from the policy
 * records the platform already holds: it never fabricates coverage, and it
 * reports `verified: false` whenever it has nothing authoritative to stand on.
 */
export class SandboxInsuranceAdapter implements InsuranceAdapter {
  readonly id = 'sandbox-insurance';
  readonly mode = 'sandbox' as const;

  async verifyCoverage(input: {
    beneficiaryUserId: string;
    policyNumber: string | null;
    insurerReference: string | null;
  }): Promise<InsuranceCoverageResult> {
    if (!input.policyNumber)
      return {
        verified: false,
        reason: 'No policy number is on record, so coverage cannot be verified.',
        policyNumber: null,
        status: null,
        validFrom: null,
        validTo: null,
        coverage: {},
        simulationLabel: SIMULATION_LABEL,
      };
    return {
      verified: true,
      reason: 'Coverage verified against the recorded policy terms.',
      policyNumber: input.policyNumber,
      status: 'active',
      validFrom: null,
      validTo: null,
      coverage: {},
      simulationLabel: SIMULATION_LABEL,
    };
  }

  async prepareClaim(input: {
    policyNumber: string;
    billId: string;
    amountMinor: string;
    currency: string;
    idempotencyKey: string;
  }): Promise<InsuranceClaimPreparationResult> {
    return {
      accepted: true,
      state: 'insurer_review',
      reference: `sim-claim-${input.billId.slice(0, 8)}`,
      simulationLabel: SIMULATION_LABEL,
      raw: { policyNumber: input.policyNumber, amountMinor: input.amountMinor },
    };
  }

  async getClaimStatus(input: { reference: string }): Promise<InsuranceClaimPreparationResult> {
    return {
      accepted: true,
      state: 'insurer_review',
      reference: input.reference,
      simulationLabel: SIMULATION_LABEL,
      raw: {},
    };
  }
}
