import { randomUUID } from 'node:crypto';
import {
  MODULE_AVAILABILITY_LABELS,
  PARTNER_MODULE_LABELS,
  SIMULATION_PREFIX,
  USSD_SESSION_TTL_SECONDS,
  CREDIT_TERMS_VERSION,
  type PartnerModule,
  type PartnerModuleStatus,
  type RewardRuleKind,
} from '@healthwallet/shared';
import type { Adapters } from '../../adapters/index.js';
import { IdentityError } from '../identity/service.js';
import { Access, missing } from '../security/access.js';
import { LedgerService } from '../ledger/service.js';
import { billAccess, latest, ensurePayableIntent } from '../providers/service.js';

const CREDIT_SIM = 'Sandbox credit terms; no real credit is issued and no partner was contacted.';
const INSURANCE_SIM = 'Sandbox insurance; coverage shown only from verified records.';
const REWARDS_SIM = 'Sandbox rewards; sponsor funding is simulated.';

/** Reward amount for a rule, in minor units. Never rounded up. */
function rewardAmount(
  kind: RewardRuleKind,
  bps: number | null,
  flatMinor: string | null,
  base: bigint,
): bigint {
  if (kind === 'flat_per_transaction') return flatMinor ? BigInt(flatMinor) : 0n;
  if (kind === 'per_transaction_bps') {
    if (!bps || bps <= 0) return 0n;
    return (base * BigInt(bps)) / 10000n;
  }
  return 0n;
}

/**
 * Partner modules (health credit, insurance, rewards, USSD). Each capability is
 * only offered when it can be verified or simulated honestly; the platform never
 * fabricates coverage, balances or partner settlement. Money-moving reward
 * accruals go through the ledger so they stay auditable.
 */
export class PartnersService {
  constructor(
    readonly ledger: LedgerService,
    readonly adapters: Adapters,
    readonly environment: string,
  ) {}

  // ---- Availability -------------------------------------------------------

  async modules(
    disabled = false,
  ): Promise<{ modules: PartnerModuleStatus[]; generatedAt: string }> {
    if (disabled)
      return {
        modules: (['health_credit', 'insurance', 'rewards', 'ussd'] as PartnerModule[]).map(
          (module) => ({
            module,
            label: PARTNER_MODULE_LABELS[module],
            availability: 'unavailable' as const,
            simulated: false,
            reason: `${MODULE_AVAILABILITY_LABELS.unavailable}. Partner modules are temporarily disabled by an operator.`,
            capabilities: [],
            simulationLabel: null,
          }),
        ),
        generatedAt: new Date().toISOString(),
      };
    const sandbox = this.adapters.payments.mode === 'sandbox';
    const status = (
      module: PartnerModule,
      availability: PartnerModuleStatus['availability'],
      reason: string,
      capabilities: string[],
      simulationLabel: string | null,
    ): PartnerModuleStatus => ({
      module,
      label: PARTNER_MODULE_LABELS[module],
      availability,
      simulated: availability === 'simulated',
      reason: `${MODULE_AVAILABILITY_LABELS[availability]}. ${reason}`,
      capabilities,
      simulationLabel,
    });
    const ussd = this.adapters.ussd.provisioned
      ? status(
          'ussd',
          'simulated',
          'A sandbox menu gateway is provisioned.',
          ['menu', 'balance', 'vouchers'],
          `${SIMULATION_PREFIX}no live USSD gateway.`,
        )
      : status(
          'ussd',
          'unavailable',
          'No USSD gateway is provisioned, so the feature-phone module is not offered.',
          [],
          null,
        );
    return {
      modules: [
        status(
          'health_credit',
          'simulated',
          sandbox ? CREDIT_SIM : 'Live credit terms are partner-defined.',
          ['offers', 'accept_terms', 'repayment_status', 'appeals'],
          CREDIT_SIM,
        ),
        status(
          'insurance',
          'simulated',
          INSURANCE_SIM,
          ['verified_coverage', 'prepare_claim', 'claim_status'],
          INSURANCE_SIM,
        ),
        status(
          'rewards',
          'simulated',
          REWARDS_SIM,
          ['rules', 'accrual', 'redemption', 'expiry'],
          REWARDS_SIM,
        ),
        ussd,
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  // ---- Health credit ------------------------------------------------------

  async listCredit(a: Access) {
    const records = (
      await a.client.query(
        `SELECT c.id,c.currency,c.principal_minor,c.fee_minor,c.repaid_minor,c.status,c.terms_version,c.terms,c.accepted_at,c.appeal,c.due_at,c.created_at,o.name AS partner_name
           FROM credit_records c JOIN organizations o ON o.id=c.partner_organization_id
          WHERE c.beneficiary_user_id=$1 ORDER BY c.created_at DESC LIMIT 100`,
        [a.actor.id],
      )
    ).rows;
    return {
      records,
      termsVersion: CREDIT_TERMS_VERSION,
      simulationLabel: CREDIT_SIM,
      disclosure:
        'Credit is provided by a partner, not by LUX HealthTrust. Terms are disclosed before you accept; the platform does not set them or move the partner’s funds.',
    };
  }

  async acceptCredit(a: Access, creditId: string) {
    const credit = (
      await a.client.query<{
        id: string;
        beneficiary_user_id: string;
        status: string;
        terms: Record<string, unknown>;
      }>('SELECT * FROM credit_records WHERE id=$1 FOR UPDATE', [creditId])
    ).rows[0];
    if (!credit || credit.beneficiary_user_id !== a.actor.id)
      throw new IdentityError(404, 'This credit offer is unavailable.');
    if (credit.status === 'accepted')
      return { status: 'accepted', acceptedAt: new Date().toISOString() };
    if (credit.status !== 'offered')
      throw new IdentityError(409, 'This credit offer can no longer be accepted.');
    if (!credit.terms || Object.keys(credit.terms).length === 0)
      throw new IdentityError(409, 'Terms must be disclosed before you can accept.');
    const row = (
      await a.client.query(
        "UPDATE credit_records SET status='accepted', accepted_at=now() WHERE id=$1 RETURNING accepted_at",
        [credit.id],
      )
    ).rows[0];
    await a.audit('partner.credit_accepted', 'credit_record', credit.id, {
      termsVersion: credit.terms,
    });
    return {
      status: 'accepted',
      acceptedAt: row.accepted_at,
      message:
        'You accepted the partner’s terms. Repayment is tracked here; the partner holds the obligation.',
      disclosure: 'Acceptance does not move funds; the partner disburses separately.',
    };
  }

  async recordRepayment(a: Access, creditId: string, input: { amountMinor: string }) {
    const credit = (
      await a.client.query<{
        id: string;
        beneficiary_user_id: string;
        partner_organization_id: string;
        principal_minor: string;
        fee_minor: string;
        repaid_minor: string;
        status: string;
      }>('SELECT * FROM credit_records WHERE id=$1 FOR UPDATE', [creditId])
    ).rows[0];
    if (!credit) throw missing();
    const isBeneficiary = credit.beneficiary_user_id === a.actor.id;
    let authorized = isBeneficiary;
    if (!authorized) {
      try {
        await a.organization(credit.partner_organization_id, [
          'partner_officer',
          'organization_admin',
          'finance_operator',
        ]);
        authorized = true;
      } catch {
        authorized = false;
      }
    }
    if (!authorized) throw missing();
    const total = BigInt(credit.principal_minor) + BigInt(credit.fee_minor);
    const next = BigInt(credit.repaid_minor) + BigInt(input.amountMinor);
    if (next > total) throw new IdentityError(409, 'Repayment exceeds the total owed.');
    const status = next === total ? 'repaid' : 'repaying';
    await a.client.query('UPDATE credit_records SET repaid_minor=$2, status=$3 WHERE id=$1', [
      credit.id,
      next.toString(),
      status,
    ]);
    await a.audit('partner.credit_repayment_recorded', 'credit_record', credit.id, {
      amountMinor: input.amountMinor,
      status,
    });
    return {
      status,
      repaidMinor: next.toString(),
      totalMinor: total.toString(),
      simulationLabel: CREDIT_SIM,
    };
  }

  async appealCredit(a: Access, creditId: string, input: { reason: string }) {
    const credit = (
      await a.client.query<{ id: string; beneficiary_user_id: string }>(
        'SELECT id,beneficiary_user_id FROM credit_records WHERE id=$1 FOR UPDATE',
        [creditId],
      )
    ).rows[0];
    if (!credit || credit.beneficiary_user_id !== a.actor.id) throw missing();
    await a.client.query("UPDATE credit_records SET status='appealed', appeal=$2 WHERE id=$1", [
      credit.id,
      JSON.stringify({ reason: input.reason, at: new Date().toISOString() }),
    ]);
    await a.audit('partner.credit_appealed', 'credit_record', credit.id);
    return { status: 'appealed', message: 'Your appeal is recorded for the partner to review.' };
  }

  // ---- Insurance ----------------------------------------------------------

  async coverage(a: Access, input: { billId?: string }) {
    let beneficiary = a.actor.id;
    if (input.billId) {
      const { bill, customer } = await billAccess(a, input.billId);
      if (!customer) throw new IdentityError(403, 'Only the customer can view their coverage.');
      beneficiary = bill.customer_user_id;
    }
    const policies = (
      await a.client.query<{
        id: string;
        policy_number: string;
        status: string;
        verified_method: string;
        valid_from: Date | null;
        valid_to: Date | null;
        coverage: Record<string, unknown>;
        insurer_organization_id: string;
      }>(
        'SELECT * FROM insurance_policies WHERE beneficiary_user_id=$1 ORDER BY verified_at DESC',
        [beneficiary],
      )
    ).rows;
    if (!policies.length)
      return {
        available: false,
        reason:
          'No verified insurance policy is on record for this beneficiary. Coverage is never inferred from uploaded documents.',
        policies: [],
      };
    const verified: Array<Record<string, unknown>> = [];
    for (const policy of policies) {
      if (!this.adapters.insurance.verifyCoverage) continue;
      const result = await this.adapters.insurance.verifyCoverage({
        beneficiaryUserId: beneficiary,
        policyNumber: policy.policy_number,
        insurerReference: policy.insurer_organization_id,
      });
      verified.push({
        policyId: policy.id,
        policyNumber: policy.policy_number,
        status: result.verified ? (result.status ?? policy.status) : 'unverified',
        verified: result.verified,
        reason: result.reason,
        validFrom: result.validFrom ?? policy.valid_from,
        validTo: result.validTo ?? policy.valid_to,
        coverage: policy.coverage,
        simulated: this.adapters.insurance.mode === 'sandbox',
        simulationLabel:
          result.simulationLabel ??
          (this.adapters.insurance.mode === 'sandbox' ? INSURANCE_SIM : null),
      });
    }
    return { available: true, policies: verified, simulationLabel: INSURANCE_SIM };
  }

  async createClaim(a: Access, input: { billId: string; policyId: string; amountMinor: string }) {
    const { bill, customer } = await billAccess(a, input.billId);
    if (!customer) throw new IdentityError(403, 'Only the customer can prepare a claim.');
    const policy = (
      await a.client.query<{
        id: string;
        beneficiary_user_id: string;
        policy_number: string;
        status: string;
      }>('SELECT * FROM insurance_policies WHERE id=$1', [input.policyId])
    ).rows[0];
    if (
      !policy ||
      policy.beneficiary_user_id !== bill.customer_user_id ||
      policy.status !== 'active'
    )
      throw new IdentityError(409, 'Select a verified, active policy for this beneficiary.');
    if (BigInt(input.amountMinor) > BigInt(bill.total_amount_minor ?? '0'))
      throw new IdentityError(400, 'The claim cannot exceed the bill total.');
    const claim = (
      await a.client.query<{ id: string }>(
        `INSERT INTO insurance_claims(policy_id,bill_id,prepared_by,amount_claimed_minor,currency,status)
         VALUES($1,$2,$3,$4,$5,'preparing') RETURNING id`,
        [policy.id, bill.id, a.actor.id, input.amountMinor, bill.currency],
      )
    ).rows[0];
    if (!this.adapters.insurance.prepareClaim)
      throw new IdentityError(503, 'Insurance claim preparation is not connected.');
    const result = await this.adapters.insurance.prepareClaim({
      policyNumber: policy.policy_number,
      billId: bill.id,
      amountMinor: input.amountMinor,
      currency: bill.currency,
      idempotencyKey: `insurance:claim:${claim.id}`,
    });
    const status = result.accepted ? 'insurer_review' : 'preparing';
    await a.client.query(
      'UPDATE insurance_claims SET status=$2, insurer_reference=$3, submitted_at=now(), decision=$4 WHERE id=$1',
      [
        claim.id,
        status,
        result.reference,
        JSON.stringify({ simulated: this.adapters.insurance.mode === 'sandbox', raw: result.raw }),
      ],
    );
    await a.audit('partner.claim_prepared', 'insurance_claim', claim.id, { status });
    return {
      claimId: claim.id,
      status,
      message:
        'Claim prepared and sent to the insurer for review. A prepared claim is not an approval or a guarantee of coverage.',
      simulationLabel: this.adapters.insurance.mode === 'sandbox' ? INSURANCE_SIM : null,
    };
  }

  async listClaims(a: Access) {
    const claims = (
      await a.client.query(
        `SELECT c.*,p.policy_number FROM insurance_claims c JOIN insurance_policies p ON p.id=c.policy_id
          WHERE c.prepared_by=$1 OR p.beneficiary_user_id=$1 ORDER BY c.created_at DESC LIMIT 100`,
        [a.actor.id],
      )
    ).rows;
    return { claims };
  }

  // ---- Rewards ------------------------------------------------------------

  async createRewardRule(
    a: Access,
    input: {
      programId: string;
      kind: RewardRuleKind;
      bps?: number;
      flatMinor?: string;
      terms?: Record<string, unknown>;
    },
  ) {
    const program = (
      await a.client.query<{ organization_id: string }>('SELECT * FROM programs WHERE id=$1', [
        input.programId,
      ])
    ).rows[0];
    if (!program) throw missing();
    await a.organization(
      program.organization_id,
      ['sponsor_admin', 'program_manager', 'organization_admin'],
      true,
    );
    if (input.kind === 'per_transaction_bps' && (!input.bps || input.bps <= 0 || input.bps > 10000))
      throw new IdentityError(400, 'bps must be between 1 and 10000.');
    if (input.kind === 'flat_per_transaction' && !input.flatMinor)
      throw new IdentityError(400, 'flatMinor is required for a flat reward.');
    const rule = (
      await a.client.query(
        `INSERT INTO reward_rules(program_id,kind,bps,flat_minor,terms) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [
          input.programId,
          input.kind,
          input.bps ?? null,
          input.flatMinor ?? null,
          JSON.stringify(input.terms ?? {}),
        ],
      )
    ).rows[0];
    await a.audit('partner.reward_rule_created', 'reward_rule', rule.id, { kind: input.kind });
    return { rule };
  }

  async listRewardRules(a: Access, programId?: string) {
    const rules = (
      await a.client.query(
        `SELECT r.* FROM reward_rules r
           JOIN programs p ON p.id=r.program_id
           JOIN organizations o ON o.id=p.organization_id AND o.status='approved'
          WHERE ($1::uuid IS NULL OR r.program_id=$1)
            AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id=p.organization_id AND m.user_id=$2 AND m.status='active')
          ORDER BY r.created_at DESC LIMIT 100`,
        [programId ?? null, a.actor.id],
      )
    ).rows;
    return { rules };
  }

  async accrueReward(
    a: Access,
    input: {
      ruleId: string;
      beneficiaryUserId: string;
      baseAmountMinor: string;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    const rule = (
      await a.client.query<{
        id: string;
        program_id: string;
        kind: RewardRuleKind;
        bps: number | null;
        flat_minor: string | null;
        status: string;
      }>('SELECT * FROM reward_rules WHERE id=$1', [input.ruleId])
    ).rows[0];
    if (!rule || rule.status !== 'active') throw missing();
    const program = (
      await a.client.query<{ organization_id: string; currency: string; status: string }>(
        'SELECT * FROM programs WHERE id=$1',
        [rule.program_id],
      )
    ).rows[0];
    if (!program) throw missing();
    await a.organization(
      program.organization_id,
      ['sponsor_admin', 'program_manager', 'organization_admin', 'finance_operator'],
      true,
    );
    if (program.status !== 'active')
      throw new IdentityError(409, 'The program is not active, so rewards cannot accrue.');
    const amount = rewardAmount(
      rule.kind,
      rule.bps,
      rule.flat_minor,
      BigInt(input.baseAmountMinor),
    );
    if (amount <= 0n)
      throw new IdentityError(409, 'This rule produces no reward for the given amount.');
    const wallet = (
      await a.client.query<{ id: string }>(
        'SELECT id FROM wallets WHERE owner_user_id=$1 AND currency=$2 ORDER BY created_at,id LIMIT 1',
        [input.beneficiaryUserId, program.currency],
      )
    ).rows[0];
    const walletId =
      wallet?.id ??
      (
        await a.client.query<{ id: string }>(
          'INSERT INTO wallets(owner_user_id,currency) VALUES($1,$2) RETURNING id',
          [input.beneficiaryUserId, program.currency],
        )
      ).rows[0].id;
    const allocation = (
      await a.client.query<{ id: string }>(
        `INSERT INTO funding_allocations(wallet_id,beneficiary_user_id,currency,source,program_id,program_rule_version)
         VALUES($1,$2,$3,'rewards',$4,(SELECT rule_version FROM programs WHERE id=$4)) RETURNING id`,
        [walletId, input.beneficiaryUserId, program.currency, rule.program_id],
      )
    ).rows[0];
    for (const bucket of ['available', 'reserved', 'pending', 'restricted'])
      await a.client.query(
        `INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) VALUES($1,$2,$3,$4,'liability','credit')`,
        [`rewards:${allocation.id}:${bucket}`, program.currency, allocation.id, bucket],
      );
    const posted = await this.ledger.creditWithin(a.client, `rewards:accrual:${allocation.id}`, {
      allocationId: allocation.id,
      amountMinor: amount.toString(),
      currency: program.currency,
      bucket: 'available',
      mode: this.adapters.payments.mode,
    });
    const entry = (
      await a.client.query<{ id: string }>(
        `INSERT INTO reward_entries(rule_id,beneficiary_user_id,allocation_id,type,amount_minor,currency,reference_type,reference_id,journal_id)
         VALUES($1,$2,$3,'accrual',$4,$5,$6,$7,$8) RETURNING id`,
        [
          rule.id,
          input.beneficiaryUserId,
          allocation.id,
          amount.toString(),
          program.currency,
          input.referenceType ?? null,
          input.referenceId ?? null,
          posted.journalId,
        ],
      )
    ).rows[0];
    await a.audit('partner.reward_accrued', 'reward_entry', entry.id, {
      allocationId: allocation.id,
      amountMinor: amount.toString(),
    });
    return {
      rewardEntryId: entry.id,
      allocationId: allocation.id,
      amountMinor: amount.toString(),
      currency: program.currency,
      message: 'Reward accrued to a funded, auditable allocation.',
      simulationLabel: this.adapters.payments.mode === 'sandbox' ? REWARDS_SIM : null,
    };
  }

  async expireReward(a: Access, entryId: string, input: { reason: string }) {
    const entry = (
      await a.client.query<{
        id: string;
        rule_id: string;
        allocation_id: string;
        amount_minor: string;
        currency: string;
        type: string;
      }>('SELECT * FROM reward_entries WHERE id=$1', [entryId])
    ).rows[0];
    if (!entry || entry.type !== 'accrual') throw missing();
    const rule = (
      await a.client.query<{ program_id: string }>('SELECT * FROM reward_rules WHERE id=$1', [
        entry.rule_id,
      ])
    ).rows[0];
    const program = (
      await a.client.query<{ organization_id: string }>('SELECT * FROM programs WHERE id=$1', [
        rule.program_id,
      ])
    ).rows[0];
    await a.organization(
      program.organization_id,
      ['sponsor_admin', 'program_manager', 'organization_admin', 'finance_operator'],
      true,
    );
    await this.ledger.move(`rewards:expire:${entry.id}`, {
      allocationId: entry.allocation_id,
      from: 'available',
      to: 'restricted',
      amountMinor: entry.amount_minor,
      currency: entry.currency,
      reason: input.reason,
    });
    const reversal = (
      await a.client.query<{ id: string }>(
        `INSERT INTO reward_entries(rule_id,beneficiary_user_id,allocation_id,type,amount_minor,currency,reference_type,reference_id)
         SELECT rule_id,beneficiary_user_id,allocation_id,'expiry',amount_minor,currency,'reward_entry',$1
           FROM reward_entries WHERE id=$1 RETURNING id`,
        [entry.id],
      )
    ).rows[0];
    await a.audit('partner.reward_expired', 'reward_entry', reversal.id, {
      sourceEntryId: entry.id,
    });
    return {
      status: 'expired',
      rewardEntryId: reversal.id,
      message: 'Reward expired and moved to restricted funds; it is no longer spendable.',
    };
  }

  async listRewards(a: Access) {
    const entries = (
      await a.client.query(
        `SELECT e.id,e.type,e.amount_minor,e.currency,e.allocation_id,e.created_at,r.kind,p.name AS program_name,
                COALESCE((SELECT a.balance_minor FROM ledger_accounts a WHERE a.allocation_id=e.allocation_id AND a.bucket='available'),0)::text AS available_minor,
                fa.status AS allocation_status,fa.expires_at
           FROM reward_entries e JOIN reward_rules r ON r.id=e.rule_id JOIN programs p ON p.id=r.program_id
           LEFT JOIN funding_allocations fa ON fa.id=e.allocation_id
          WHERE e.beneficiary_user_id=$1 ORDER BY e.created_at DESC LIMIT 100`,
        [a.actor.id],
      )
    ).rows;
    return { entries, simulationLabel: REWARDS_SIM };
  }

  /** Pay a healthcare bill from an accrued reward allocation. */
  async redeemReward(
    a: Access,
    input: { allocationId: string; billId: string; amountMinor: string },
  ) {
    const { bill, customer } = await billAccess(a, input.billId, true);
    if (!customer) throw new IdentityError(403, 'Only the customer can redeem a reward.');
    const allocation = (
      await a.client.query<{
        id: string;
        source: string;
        beneficiary_user_id: string;
        status: string;
      }>('SELECT id,source,beneficiary_user_id,status FROM funding_allocations WHERE id=$1', [
        input.allocationId,
      ])
    ).rows[0];
    if (
      !allocation ||
      allocation.source !== 'rewards' ||
      allocation.beneficiary_user_id !== bill.customer_user_id ||
      allocation.status !== 'active'
    )
      throw new IdentityError(409, 'This reward is not available to redeem.');
    const rev = await latest(a.client, bill.id);
    const intent = await ensurePayableIntent(a.client, bill, rev, {
      adapterMode: this.adapters.payments.mode,
      appEnv: this.environment,
      key: `rewards:redeem:${bill.id}:${input.allocationId}`,
    });
    await this.ledger.reserveWithin(a.client, `rewards:redeem:${input.allocationId}:${intent.id}`, {
      allocationId: allocation.id,
      paymentIntentId: intent.id,
      amountMinor: input.amountMinor,
    });
    await a.client.query(
      `INSERT INTO reward_entries(rule_id,beneficiary_user_id,allocation_id,type,amount_minor,currency,reference_type,reference_id)
       SELECT rule_id,beneficiary_user_id,allocation_id,'redemption',$2,currency,'payment_intent',$3
         FROM reward_entries WHERE allocation_id=$1 AND type='accrual' ORDER BY created_at LIMIT 1`,
      [allocation.id, input.amountMinor, intent.id],
    );
    await a.audit('partner.reward_redeemed', 'funding_allocation', allocation.id, {
      paymentIntentId: intent.id,
    });
    return {
      paymentIntentId: intent.id,
      message:
        'Reward reserved to this bill. This is a hold, not proof of settlement; the provider confirms payment separately.',
    };
  }

  // ---- USSD ---------------------------------------------------------------

  async ussdSession(a: Access, input: { phone: string; input: string; sessionCode?: string }) {
    if (!this.adapters.ussd.provisioned)
      throw new IdentityError(503, 'USSD is not provisioned, so no session can be started.');
    // Tenant/identity isolation: a USSD session may only be opened for the phone
    // number of the authenticated actor. Acting on another number is not allowed.
    if (input.phone !== a.actor.phone) throw missing();
    const existing = input.sessionCode
      ? (
          await a.client.query<{
            id: string;
            state: Record<string, unknown>;
            session_code: string;
          }>(
            'SELECT id,state,session_code FROM ussd_sessions WHERE session_code=$1 AND actor_user_id=$2 AND expires_at>now()',
            [input.sessionCode, a.actor.id],
          )
        ).rows[0]
      : undefined;
    const sessionCode = existing?.session_code ?? input.sessionCode ?? randomUUID();
    const screen = await this.adapters.ussd.handleSession({
      sessionCode,
      phone: input.phone,
      input: input.input,
      state: existing?.state ?? {},
    });
    if (existing)
      await a.client.query('UPDATE ussd_sessions SET state=$2, last_screen=$3 WHERE id=$1', [
        existing.id,
        JSON.stringify(screen.state),
        screen.screen,
      ]);
    else
      await a.client.query(
        `INSERT INTO ussd_sessions(session_code,phone,actor_user_id,state,last_screen,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 second')`,
        [
          sessionCode,
          input.phone,
          a.actor.id,
          JSON.stringify(screen.state),
          screen.screen,
          USSD_SESSION_TTL_SECONDS,
        ],
      );
    return { sessionCode, ...screen, simulated: this.adapters.ussd.mode === 'sandbox' };
  }
}
