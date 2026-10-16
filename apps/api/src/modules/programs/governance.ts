import type pg from 'pg';
import { IdentityError } from '../identity/service.js';
import { Access, denied, missing } from '../security/access.js';

export const governanceRoles = [
  'sponsor_admin',
  'program_manager',
  'organization_admin',
  'finance_operator',
  'employer_admin',
] as const;

export type ProgramChangeType = 'create' | 'budget' | 'status' | 'rules' | 'restriction';

/** The distinct role required to approve each kind of program change. */
const APPROVER_ROLE: Record<ProgramChangeType, string> = {
  create: 'organization_admin',
  budget: 'finance_operator',
  status: 'program_manager',
  rules: 'program_manager',
  restriction: 'program_manager',
};

type ProgramRow = {
  id: string;
  organization_id: string;
  name: string;
  currency: string;
  status: string;
  rule_version: number;
  allowed_categories: string[];
  allowed_provider_ids: string[];
  max_per_payment_minor: string | null;
  budget_minor: string | null;
  rules: Record<string, unknown>;
  starts_at: Date | null;
  expires_at: Date | null;
};

type ApprovalRow = {
  id: string;
  program_id: string;
  requested_by: string | null;
  required_role: string;
  change_type: ProgramChangeType;
  change_payload: Record<string, unknown>;
  status: string;
  created_at: Date;
};

/**
 * Program governance. Structural changes (budget, status, eligibility rules,
 * restrictions) never apply directly: they are recorded as a proposal and only
 * take effect when a *different* authorized approver accepts them. Separately,
 * the report keeps program-level budgets distinct from per-beneficiary
 * allocation balances.
 */
export class GovernanceService {
  constructor(readonly pool: pg.Pool) {}

  private async load(a: Access, programId: string, write: boolean): Promise<ProgramRow> {
    const program = (
      await a.client.query<ProgramRow>(
        `SELECT * FROM programs WHERE id=$1 ${write ? 'FOR UPDATE' : 'FOR SHARE'}`,
        [programId],
      )
    ).rows[0];
    if (!program) throw missing();
    await a.organization(program.organization_id, governanceRoles, true);
    return program;
  }

  async createProgram(
    a: Access,
    input: {
      organizationId: string;
      name: string;
      currency: string;
      budgetMinor?: string;
      allowedCategories?: string[];
      allowedProviderIds?: string[];
      maxPerPaymentMinor?: string;
      rules?: Record<string, unknown>;
    },
  ) {
    await a.organization(input.organizationId, governanceRoles, true);
    const program = (
      await a.client.query<ProgramRow>(
        `INSERT INTO programs(organization_id,name,currency,status,budget_minor,allowed_categories,allowed_provider_ids,max_per_payment_minor,rules)
         VALUES($1,$2,$3,'pending_approval',$4,$5::text[],$6::uuid[],$7,$8) RETURNING *`,
        [
          input.organizationId,
          input.name,
          input.currency,
          input.budgetMinor ?? null,
          input.allowedCategories ?? [],
          input.allowedProviderIds ?? [],
          input.maxPerPaymentMinor ?? null,
          JSON.stringify(input.rules ?? {}),
        ],
      )
    ).rows[0];
    const approval = (
      await a.client.query<ApprovalRow>(
        `INSERT INTO program_approvals(program_id,requested_by,required_role,change_type,change_payload)
         VALUES($1,$2,$3,'create',$4) RETURNING *`,
        [program.id, a.actor.id, APPROVER_ROLE.create, JSON.stringify({ name: input.name })],
      )
    ).rows[0];
    await a.audit('program.created', 'program', program.id, { approvalId: approval.id });
    return {
      program,
      approval,
      message:
        'Program created in pending_approval. A separate organization_admin must approve it before it can fund anything.',
    };
  }

  async listPrograms(a: Access) {
    const rows = (
      await a.client.query<ProgramRow & { organization_name: string }>(
        `SELECT p.*,o.name AS organization_name
           FROM programs p
           JOIN organizations o ON o.id=p.organization_id
          WHERE EXISTS (
                  SELECT 1 FROM organization_memberships m
                   WHERE m.organization_id=p.organization_id AND m.user_id=$1
                     AND m.status='active' AND m.role=ANY($2::text[])
                )
             OR $3::boolean
          ORDER BY p.created_at DESC LIMIT 100`,
        [a.actor.id, governanceRoles, a.actor.roles.includes('platform_admin')],
      )
    ).rows;
    const approvals = (
      await a.client.query<ApprovalRow>(
        `SELECT * FROM program_approvals WHERE program_id = ANY($1::uuid[]) AND status='pending' ORDER BY created_at`,
        [rows.map((r) => r.id)],
      )
    ).rows;
    return {
      programs: rows.map((program) => ({
        ...program,
        pendingApprovals: approvals.filter((x) => x.program_id === program.id),
      })),
    };
  }

  async propose(
    a: Access,
    programId: string,
    input: { changeType: ProgramChangeType; payload: Record<string, unknown>; note?: string },
  ) {
    await this.load(a, programId, true);
    const requiredRole = APPROVER_ROLE[input.changeType];
    const row = (
      await a.client.query<ApprovalRow>(
        `INSERT INTO program_approvals(program_id,requested_by,required_role,change_type,change_payload)
         VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [programId, a.actor.id, requiredRole, input.changeType, JSON.stringify(input.payload)],
      )
    ).rows[0];
    await a.audit('program.change_proposed', 'program', programId, {
      approvalId: row.id,
      changeType: input.changeType,
      requiredRole,
    });
    return {
      approval: row,
      message: `A separate ${requiredRole} must approve this ${input.changeType} change. It is not applied yet.`,
    };
  }

  async decide(
    a: Access,
    approvalId: string,
    input: { approve: boolean; note: string },
  ): Promise<{ status: string; applied: boolean }> {
    const approval = (
      await a.client.query<ApprovalRow>('SELECT * FROM program_approvals WHERE id=$1 FOR UPDATE', [
        approvalId,
      ])
    ).rows[0];
    if (!approval) throw missing();
    if (approval.status !== 'pending')
      throw new IdentityError(409, 'This change has already been decided.');
    const program = (
      await a.client.query<ProgramRow>('SELECT * FROM programs WHERE id=$1 FOR UPDATE', [
        approval.program_id,
      ])
    ).rows[0];
    if (!program) throw missing();
    const isPlatform = a.actor.roles.includes('platform_admin');
    const membership = (
      await a.client.query<{ role: string }>(
        `SELECT m.role FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
          WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' AND o.status='approved'`,
        [program.organization_id, a.actor.id],
      )
    ).rows[0];
    if (!isPlatform) {
      if (!membership) throw missing();
      if (membership.role !== approval.required_role) throw denied();
      a.mfa();
    } else {
      a.platform();
    }
    if (approval.requested_by === a.actor.id && !isPlatform)
      throw new IdentityError(403, 'A different authorized approver must decide this change.');

    if (!input.approve) {
      await a.client.query(
        "UPDATE program_approvals SET status='rejected',decided_by=$2,decision_note=$3,decided_at=now() WHERE id=$1",
        [approval.id, a.actor.id, input.note],
      );
      await a.audit('program.change_rejected', 'program', program.id, {
        approvalId: approval.id,
        changeType: approval.change_type,
      });
      return { status: 'rejected', applied: false };
    }

    await this.apply(a.client, program, approval);
    await a.client.query(
      "UPDATE program_approvals SET status='approved',decided_by=$2,decision_note=$3,decided_at=now() WHERE id=$1",
      [approval.id, a.actor.id, input.note],
    );
    await a.audit('program.change_applied', 'program', program.id, {
      approvalId: approval.id,
      changeType: approval.change_type,
    });
    return { status: 'approved', applied: true };
  }

  private async apply(client: pg.PoolClient, program: ProgramRow, approval: ApprovalRow) {
    const payload = approval.change_payload as Record<string, unknown>;
    switch (approval.change_type) {
      case 'create':
        await client.query("UPDATE programs SET status='active' WHERE id=$1", [program.id]);
        return;
      case 'budget': {
        const value = payload.budgetMinor;
        if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value))
          throw new IdentityError(400, 'A positive budgetMinor is required.');
        await client.query('UPDATE programs SET budget_minor=$2 WHERE id=$1', [program.id, value]);
        return;
      }
      case 'status': {
        const value = String(payload.status);
        if (!['draft', 'pending_approval', 'active', 'paused', 'closed'].includes(value))
          throw new IdentityError(400, 'Unknown program status.');
        await client.query('UPDATE programs SET status=$2 WHERE id=$1', [program.id, value]);
        return;
      }
      case 'rules': {
        const rules = payload.rules;
        if (!rules || typeof rules !== 'object')
          throw new IdentityError(400, 'A rules object is required.');
        await client.query(
          'UPDATE programs SET rules=$2, rule_version=rule_version+1 WHERE id=$1',
          [program.id, JSON.stringify(rules)],
        );
        return;
      }
      case 'restriction': {
        const categories = Array.isArray(payload.allowedCategories)
          ? (payload.allowedCategories as string[])
          : null;
        const providers = Array.isArray(payload.allowedProviderIds)
          ? (payload.allowedProviderIds as string[])
          : null;
        const max =
          typeof payload.maxPerPaymentMinor === 'string' ? payload.maxPerPaymentMinor : null;
        if (!categories && !providers && !max)
          throw new IdentityError(400, 'At least one restriction field is required.');
        await client.query(
          `UPDATE programs SET
             allowed_categories=COALESCE($2,allowed_categories),
             allowed_provider_ids=COALESCE($3::uuid[],allowed_provider_ids),
             max_per_payment_minor=COALESCE($4,max_per_payment_minor)
           WHERE id=$1`,
          [program.id, categories, providers, max],
        );
        return;
      }
    }
  }

  /** Program-level budget vs. per-beneficiary allocations, kept separate. */
  async report(a: Access, programId: string) {
    const program = await this.load(a, programId, false);
    const budget = BigInt(program.budget_minor ?? '0');
    const committed = (
      await a.client.query<{ allocated: string; captured: string }>(
        `SELECT
           COALESCE((
             SELECT SUM(a.balance_minor) FROM funding_allocations fa
              JOIN ledger_accounts a ON a.allocation_id=fa.id AND a.bucket='available'
             WHERE fa.program_id=$1 AND fa.status='active'
           ),0)::text AS allocated,
           COALESCE((
             SELECT SUM(r.amount_minor) FROM funding_reservations r
              JOIN funding_allocations fa2 ON fa2.id=r.allocation_id
             WHERE fa2.program_id=$1 AND r.status='captured'
           ),0)::text AS captured`,
        [programId],
      )
    ).rows[0] ?? { allocated: '0', captured: '0' };

    const allocations = (
      await a.client.query(
        `SELECT fa.id,fa.beneficiary_user_id,fa.status,
                COALESCE((SELECT a.balance_minor FROM ledger_accounts a WHERE a.allocation_id=fa.id AND a.bucket='available'),0)::text AS available_minor,
                fa.program_rule_version,fa.allowed_categories,
                v.status AS voucher_status
           FROM funding_allocations fa
           LEFT JOIN vouchers v ON v.allocation_id=fa.id
          WHERE fa.program_id=$1 ORDER BY fa.created_at LIMIT 500`,
        [programId],
      )
    ).rows;

    const ruleDrift = allocations.filter((x) => x.program_rule_version !== program.rule_version);
    return {
      program: {
        id: program.id,
        name: program.name,
        currency: program.currency,
        status: program.status,
        ruleVersion: program.rule_version,
        budgetMinor: program.budget_minor,
      },
      budget: {
        budgetMinor: budget.toString(),
        allocatedMinor: committed.allocated,
        capturedMinor: committed.captured,
        availableMinor: (budget > BigInt(committed.allocated)
          ? budget - BigInt(committed.allocated)
          : 0n
        ).toString(),
      },
      beneficiaryAllocations: allocations,
      eligibilityRevision: {
        currentRuleVersion: program.rule_version,
        allocationsNeedingReconfirmation: ruleDrift.map((x) => x.id),
        guidance:
          ruleDrift.length > 0
            ? 'Some allocations were granted under earlier rules. Re-confirm or re-issue them before use; the funding engine blocks drifted allocations until then.'
            : 'All allocations are on the current rule version.',
      },
    };
  }
}
