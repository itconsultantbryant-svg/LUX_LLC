import {
  ASSISTANT_ACTION_REQUIRES_CONFIRMATION,
  ASSISTANT_DISCLAIMER,
  ASSISTANT_ESCALATION_NOTE,
  ASSISTANT_UNAVAILABLE_NOTE,
  FEE_SCHEDULE,
  type AssistantAnswer,
  type AssistantRequest,
  type AssistantSource,
  type FundingPlan,
} from '@healthwallet/shared';
import { IdentityError } from '../identity/service.js';
import { Access } from '../security/access.js';
import { billAccess, latest } from '../providers/service.js';
import { buildFundingPlan } from '../assistance/engine.js';
import { AssistanceService } from '../assistance/service.js';

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

type Answers = AssistantAnswer;

/**
 * Grounded support assistant. Every answer is assembled from records the actor
 * is authorized to read (or from the approved fee schedule), and reports its
 * `groundedOn` fields so the grounding can be audited. It never authorizes
 * payments or moves funds; consequential actions are only *prepared* and
 * require an explicit, separately verified confirmation.
 */
export class AssistantService {
  constructor(readonly assistance: AssistanceService) {}

  private base(partial: Partial<Answers> & Pick<Answers, 'tool' | 'outcome' | 'text'>): Answers {
    return {
      groundedOn: [],
      sources: [],
      recommendedAction: null,
      confirmation: null,
      canEscalate: true,
      disclaimer: ASSISTANT_DISCLAIMER,
      simulationLabel: null,
      generatedBy: 'deterministic',
      ...partial,
    };
  }

  private escalated(tool: Answers['tool'], text: string, groundedOn: string[] = []): Answers {
    return this.base({
      tool,
      outcome: 'escalated',
      text: `${text} ${ASSISTANT_ESCALATION_NOTE}`,
      groundedOn,
      canEscalate: true,
    });
  }

  private unavailable(tool: Answers['tool'], text: string): Answers {
    return this.base({
      tool,
      outcome: 'unavailable',
      text: `${text} ${ASSISTANT_UNAVAILABLE_NOTE}`,
      canEscalate: true,
    });
  }

  async ask(a: Access, request: AssistantRequest): Promise<Answers> {
    switch (request.tool) {
      case 'explain_bill_status':
        return this.explainBillStatus(a, request.billId);
      case 'explain_funding_sources':
        return this.explainFundingSources(a, request.billId);
      case 'find_providers':
        return this.findProviders(a, request.providerName);
      case 'explain_fees':
        return this.explainFees();
      case 'navigate':
        return this.navigate(request.query);
      case 'prepare_support_request':
        return this.prepareSupportRequest(a, request);
    }
  }

  private async explainBillStatus(a: Access, billId?: string): Promise<Answers> {
    if (!billId) return this.unavailable('explain_bill_status', 'No bill was selected to explain.');
    let bill: { id: string; status: string; currency: string | null; total_amount_minor: unknown };
    try {
      ({ bill } = await billAccess(a, billId));
    } catch (error) {
      if (error instanceof IdentityError && (error.statusCode === 404 || error.statusCode === 403))
        return this.escalated(
          'explain_bill_status',
          'I could not find a bill you are authorized to view, so I cannot describe its status.',
        );
      throw error;
    }
    if (bill.total_amount_minor === null || !bill.currency)
      return this.escalated(
        'explain_bill_status',
        'This bill does not yet have a confirmed currency and total, so its status cannot be explained reliably.',
        ['bill.total_amount_minor', 'bill.currency'],
      );

    const validation = (
      await a.client.query<{ route: string; created_at: Date }>(
        'SELECT route,created_at FROM validation_runs WHERE bill_id=$1 ORDER BY created_at DESC LIMIT 1',
        [bill.id],
      )
    ).rows[0];
    const extraction = (
      await a.client.query<{ requires_review: boolean }>(
        "SELECT requires_review FROM ai_runs WHERE bill_id=$1 AND status='completed' ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1",
        [bill.id],
      )
    ).rows[0];
    const payment = (
      await a.client.query<{ status: string; amount_minor: string }>(
        'SELECT status,amount_minor FROM payment_intents WHERE bill_id=$1 ORDER BY created_at DESC LIMIT 1',
        [bill.id],
      )
    ).rows[0];
    const revision = await latest(a.client, bill.id);

    const sources: AssistantSource[] = [
      { kind: 'bill', id: bill.id, label: `Bill ${bill.id.slice(0, 8)}` },
      {
        kind: 'bill_revision',
        id: revision.id ?? null,
        label: `Invoice ${revision.reference ?? revision.revision}`,
      },
    ];
    if (validation)
      sources.push({
        kind: 'validation_run',
        id: null,
        label: `Validation (${validation.route})`,
      });
    if (payment)
      sources.push({
        kind: 'payment_intent',
        id: null,
        label: `Payment (${payment.status})`,
      });

    const lines: string[] = [
      `This bill is for ${bill.total_amount_minor} minor units of ${bill.currency}.`,
      `Its current record status is "${bill.status}".`,
    ];
    if (extraction?.requires_review)
      lines.push('The extracted fields were flagged for your review before payment.');
    lines.push(
      validation
        ? `The latest validation route was "${validation.route}".`
        : 'No validation has been recorded for this bill yet.',
    );
    lines.push(
      payment
        ? `The latest payment attempt is recorded as "${payment.status}". A ledger capture is a platform record and not proof the provider settled funds.`
        : 'No payment has been requested for this bill yet.',
    );

    return this.base({
      tool: 'explain_bill_status',
      outcome: 'answered',
      text: lines.join(' '),
      groundedOn: [
        'bill.status',
        'bill.currency',
        'bill.total_amount_minor',
        ...(validation ? ['validation_runs.route'] : []),
        ...(payment ? ['payment_intents.status'] : []),
      ],
      sources,
      recommendedAction: payment ? null : 'request_help',
    });
  }

  private async explainFundingSources(a: Access, billId?: string): Promise<Answers> {
    if (!billId)
      return this.unavailable('explain_funding_sources', 'No bill was selected to explain.');
    let plan: FundingPlan;
    try {
      const { bill } = await billAccess(a, billId);
      plan = await buildFundingPlan(a.client, bill.id, {
        simulationLabel: 'SIMULATION — sandbox explanation; no real money moves.',
      });
    } catch (error) {
      if (error instanceof IdentityError && (error.statusCode === 404 || error.statusCode === 403))
        return this.escalated(
          'explain_funding_sources',
          'I could not find a bill you are authorized to view, so I cannot explain its funding.',
        );
      if (error instanceof IdentityError && error.statusCode === 409)
        return this.escalated('explain_funding_sources', error.message);
      throw error;
    }

    const eligible = plan.sources.filter((source) => source.eligible);
    const blocked = plan.sources.filter((source) => !source.eligible);
    const lines = [
      `The bill is ${plan.billAmountMinor} minor units of ${plan.currency}.`,
      `Eligible funds total ${plan.totalEligibleMinor} minor units, and ${plan.allocatedMinor} is already reserved.`,
      plan.shortfallMinor === '0'
        ? 'There is no shortfall on the current records.'
        : `The remaining shortfall is ${plan.shortfallMinor} minor units.`,
    ];
    if (eligible.length)
      lines.push(
        `Eligible sources: ${eligible.map((s) => `${s.label} (${s.availableMinor})`).join(', ')}.`,
      );
    else lines.push('No eligible funding source is currently available for this service.');
    if (blocked.length)
      lines.push(
        `${blocked.length} source(s) exist but are not eligible (restrictions may apply; open the bill to see each reason).`,
      );
    lines.push(plan.insurance.available ? '' : plan.insurance.reason);
    if (plan.simulationLabel) lines.push(plan.simulationLabel);

    const actions = plan.actions.filter((action) => action.available);
    return this.base({
      tool: 'explain_funding_sources',
      outcome: 'answered',
      text: lines.filter(Boolean).join(' '),
      groundedOn: [
        'plan.billAmountMinor',
        'plan.totalEligibleMinor',
        'plan.allocatedMinor',
        'plan.shortfallMinor',
        'plan.sources',
      ],
      sources: [
        { kind: 'bill', id: plan.billId, label: `Bill ${plan.billId.slice(0, 8)}` },
        { kind: 'funding_plan', id: null, label: `Funding plan ${plan.planVersion}` },
      ],
      recommendedAction: actions[0]?.action ?? null,
    });
  }

  private async findProviders(a: Access, providerName?: string): Promise<Answers> {
    const query = (providerName ?? '').trim();
    const rows = (
      await a.client.query<{ id: string; legal_name: string; license_number: string }>(
        `SELECT p.id,p.legal_name,p.license_number FROM providers p JOIN organizations o ON o.id=p.organization_id JOIN LATERAL (SELECT * FROM provider_verification_records WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) v ON true WHERE p.status='verified' AND o.status='approved' AND v.status='verified' AND v.method='registry_check' AND v.valid_until>now() AND ($1='' OR p.legal_name ILIKE '%'||$1||'%') ORDER BY p.legal_name,p.id LIMIT 20`,
        [query],
      )
    ).rows;
    if (!rows.length)
      return this.base({
        tool: 'find_providers',
        outcome: 'answered',
        text: query
          ? `No currently verified provider matches "${query}". I can only list providers whose verification is current.`
          : 'No currently verified providers are listed right now.',
        groundedOn: ['providers'],
        sources: [],
      });
    return this.base({
      tool: 'find_providers',
      outcome: 'answered',
      text: `Verified providers: ${rows.map((r) => r.legal_name).join('; ')}. Only providers with a current registry verification are listed.`,
      groundedOn: ['providers.legal_name', 'provider_verification_records.status'],
      sources: rows.map((r) => ({
        kind: 'provider',
        id: r.id,
        label: `${r.legal_name} (${r.license_number})`,
      })),
    });
  }

  private explainFees(): Answers {
    const text = [
      `Published fees (${FEE_SCHEDULE.version}, ${FEE_SCHEDULE.status}, effective ${FEE_SCHEDULE.effectiveFrom}):`,
      ...FEE_SCHEDULE.lines.map(
        (line) => `${line.label}: ${line.amountMinor} minor units (${line.basis})`,
      ),
      FEE_SCHEDULE.note,
    ].join(' ');
    return this.base({
      tool: 'explain_fees',
      outcome: 'answered',
      text,
      groundedOn: ['fee_schedule.version', 'fee_schedule.lines'],
      sources: [{ kind: 'fee_schedule', id: FEE_SCHEDULE.version, label: 'Fee schedule' }],
    });
  }

  private navigate(query?: string): Answers {
    const text = (query ?? '').toLowerCase();
    const routes: Array<{ when: RegExp; path: string; label: string }> = [
      { when: /pay|authorize/i, path: '/bills/:id/pay', label: 'Payment authorization' },
      {
        when: /fund|assistance|shortfall|saving|contribution/i,
        path: '/bills/:id/assistance',
        label: 'Funding assistance',
      },
      { when: /provider|hospital|clinic|find/i, path: '/providers', label: 'Provider directory' },
      { when: /voucher|reward/i, path: '/wallet', label: 'Wallet and vouchers' },
      { when: /insurance|claim|cover/i, path: '/insurance', label: 'Insurance' },
      { when: /help|support|human|agent/i, path: '/support', label: 'Support' },
      { when: /fee|cost|charge/i, path: '/fees', label: 'Fees' },
    ];
    const match = routes.find((route) => route.when.test(text));
    if (!match)
      return this.base({
        tool: 'navigate',
        outcome: 'answered',
        text: 'I can help you find: bills and payment, funding assistance, the provider directory, wallet and vouchers, insurance, fees, or support. Tell me what you want to do.',
        groundedOn: ['app.route'],
        sources: [],
      });
    return this.base({
      tool: 'navigate',
      outcome: 'answered',
      text: `That is under ${match.label} at ${match.path}.`,
      groundedOn: ['app.route'],
      sources: [{ kind: 'app_route', id: match.path, label: match.label }],
    });
  }

  private async prepareSupportRequest(a: Access, request: AssistantRequest): Promise<Answers> {
    if (!request.billId || !request.supportReason)
      return this.unavailable(
        'prepare_support_request',
        'A bill and a reason are required before I can prepare a support request.',
      );
    let bill: { id: string; customer_user_id: string };
    try {
      ({ bill } = await billAccess(a, request.billId));
    } catch (error) {
      if (error instanceof IdentityError && (error.statusCode === 404 || error.statusCode === 403))
        return this.escalated(
          'prepare_support_request',
          'I could not find a bill you are authorized to request support for.',
        );
      throw error;
    }
    const kind = request.supportKind ?? 'help';
    const summary = `Prepare a "${kind}" support request for bill ${bill.id.slice(0, 8)}: ${request.supportReason}`;
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
    const row = (
      await a.client.query<{ id: string }>(
        `INSERT INTO assistant_confirmations(actor_user_id,tool,action,bill_id,payload,summary,status,expires_at)
         VALUES($1,'prepare_support_request','request_support',$2,$3,$4,'pending',$5) RETURNING id`,
        [
          a.actor.id,
          bill.id,
          JSON.stringify({ kind, reason: request.supportReason }),
          summary,
          expiresAt,
        ],
      )
    ).rows[0];
    return this.base({
      tool: 'prepare_support_request',
      outcome: 'needs_confirmation',
      text: `${ASSISTANT_ACTION_REQUIRES_CONFIRMATION} ${summary}`,
      groundedOn: ['bill.id'],
      sources: [{ kind: 'bill', id: bill.id, label: `Bill ${bill.id.slice(0, 8)}` }],
      recommendedAction: 'request_support',
      confirmation: {
        id: row.id,
        tool: 'prepare_support_request',
        action: 'request_support',
        summary,
        expiresAt,
      },
    });
  }

  /** Execute a previously prepared action, after explicit confirmation. */
  async confirm(a: Access, confirmationId: string): Promise<{ status: string; result: unknown }> {
    const row = (
      await a.client.query<{
        id: string;
        actor_user_id: string;
        action: string;
        bill_id: string | null;
        payload: { kind: 'shortfall_support' | 'help'; reason: string };
        status: string;
        expires_at: Date;
        result: unknown;
      }>('SELECT * FROM assistant_confirmations WHERE id=$1 FOR UPDATE', [confirmationId])
    ).rows[0];
    if (!row || row.actor_user_id !== a.actor.id)
      throw new IdentityError(404, 'This confirmation is unavailable.');
    if (row.status === 'confirmed') return { status: 'confirmed', result: row.result };
    if (row.status !== 'pending')
      throw new IdentityError(409, 'This confirmation can no longer be used.');
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await a.client.query("UPDATE assistant_confirmations SET status='expired' WHERE id=$1", [
        row.id,
      ]);
      throw new IdentityError(409, 'This confirmation expired. Ask again to prepare a new one.');
    }
    if (row.action !== 'request_support' || !row.bill_id)
      throw new IdentityError(409, 'This confirmation is not supported.');
    const result = await this.assistance.requestSupport(a, row.bill_id, {
      kind: row.payload.kind,
      reason: row.payload.reason,
    });
    await a.client.query(
      "UPDATE assistant_confirmations SET status='confirmed', confirmed_at=now(), result=$2 WHERE id=$1",
      [row.id, JSON.stringify(result)],
    );
    await a.audit('assistant.action_confirmed', 'assistant_confirmation', row.id, {
      action: row.action,
    });
    return { status: 'confirmed', result };
  }
}
