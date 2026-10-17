import { randomUUID } from 'node:crypto';
import {
  ASSISTANT_DISCLAIMER,
  FEE_SCHEDULE,
  type AiExtractionResult,
  type ChatActionKind,
  type ChatConfirmation,
  type ChatDocumentReview,
  type ChatItemIntent,
  type LocationInput,
  type NearbyProvider,
} from '@healthwallet/shared';
import type pg from 'pg';
import { IdentityError } from '../identity/service.js';
import type { Access } from '../security/access.js';
import type { Adapters } from '../../adapters/index.js';
import { walletSummary } from '../ledger/wallet.js';
import { LedgerService } from '../ledger/service.js';
import { FundingService } from '../funding/service.js';
import { AssistanceService } from '../assistance/service.js';
import { getLocation, nearbyProviders, upsertLocation } from '../proximity/service.js';
import { classifyIntent, extractAmountMinor } from './intent.js';
import { assessProvider, type ProviderCandidate } from './provider-match.js';

const SIMULATION_LABEL =
  'SIMULATION — sandbox assistant; no real money moves and nothing is verified.';
const MAX_DOCUMENT_BYTES = 512 * 1024;
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DEPOSIT_CURRENCY = 'LRD';
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

export type ChatAction = { label: string; href: string };

export type ChatItem = {
  kind: 'alert' | 'recommendation' | 'action';
  title: string;
  detail: string;
  action?: ChatAction;
  confirmation?: ChatConfirmation;
  intent?: ChatItemIntent;
};

export type ChatExtractionSummary = {
  providerName: string | null;
  totalAmountMinor: number | null;
  currency: string | null;
  serviceDate: string | null;
  confidence: number;
  unreadable: boolean;
  ambiguous: string[];
};

export type ChatMessageContent = {
  text: string;
  disclaimer?: string;
  document?: { contentType: string; byteSize: number };
  documentReview?: ChatDocumentReview;
  extraction?: ChatExtractionSummary;
  items?: ChatItem[];
  providers?: NearbyProvider[];
  usedLocation?: boolean;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: ChatMessageContent;
  createdAt: string;
};

export type ChatConfirmResult = {
  id: string;
  action: ChatActionKind;
  status: 'executed' | 'needs_screen';
  message: string;
  redirect: string | null;
  assistant: ChatMessage | null;
};

/**
 * Conversational assistant over the customer's own records. It answers free-form
 * prompts, reads an uploaded provider bill through the AI extraction adapter,
 * surfaces verified care the customer can reach from their shared location, and
 * executes consequential instructions **only after the customer approves them**
 * through an explicit confirmation record. It never moves money by itself.
 */
export class ChatService {
  private readonly assistance: AssistanceService;
  private readonly funding: FundingService;

  constructor(private readonly deps: { adapters: Adapters; pool: pg.Pool; appEnv: string }) {
    const ledger = new LedgerService(deps.pool);
    this.assistance = new AssistanceService(ledger, deps.adapters.payments.mode, deps.appEnv);
    this.funding = new FundingService(ledger, deps.adapters.funding, deps.appEnv);
  }

  private get adapters(): Adapters {
    return this.deps.adapters;
  }

  async history(a: Access, limit = 40): Promise<ChatMessage[]> {
    const rows = (
      await a.client.query<{
        id: string;
        role: 'user' | 'assistant';
        content: ChatMessageContent;
        created_at: Date;
      }>(
        'SELECT id,role,content,created_at FROM chat_messages WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2',
        [a.actor.id, limit],
      )
    ).rows;
    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** Alerts, recommendations and actions derived from the customer's records. */
  async briefing(a: Access): Promise<{ items: ChatItem[]; simulationLabel: string }> {
    const items: ChatItem[] = [];

    const bills = (
      await a.client.query<{
        id: string;
        status: string;
        currency: string | null;
        total_amount_minor: number | null;
        provider_name: string | null;
      }>(
        `SELECT id,status,currency,total_amount_minor,provider_name FROM bills
         WHERE customer_user_id=$1 AND status IN ('extracted','user_review','funding_proposed','awaiting_auth','needs_review')
         ORDER BY created_at DESC LIMIT 5`,
        [a.actor.id],
      )
    ).rows;

    for (const bill of bills) {
      const amount =
        bill.total_amount_minor != null && bill.currency
          ? `${(bill.total_amount_minor / 100).toFixed(2)} ${bill.currency}`
          : 'an unconfirmed amount';
      if (
        bill.status === 'user_review' ||
        bill.status === 'extracted' ||
        bill.status === 'needs_review'
      )
        items.push({
          kind: 'action',
          title: 'Review an extracted bill',
          detail: `${bill.provider_name ?? 'A provider'} bill for ${amount} needs your confirmation before it can be funded.`,
          action: { label: 'Open bill', href: `/pay?bill=${bill.id}` },
        });
      else if (bill.status === 'funding_proposed')
        items.push({
          kind: 'recommendation',
          title: 'Choose funding for a bill',
          detail: `A funding plan is ready for the ${bill.provider_name ?? 'provider'} bill of ${amount}.`,
          action: { label: 'Review funding', href: `/support?bill=${bill.id}` },
        });
      else if (bill.status === 'awaiting_auth')
        items.push({
          kind: 'action',
          title: 'Authorize a payment',
          detail: `The ${bill.provider_name ?? 'provider'} bill of ${amount} is waiting for your payment authorization.`,
          action: { label: 'Authorize', href: `/pay?bill=${bill.id}` },
        });
    }

    const pending = (
      await a.client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM support_requests s
         JOIN bills b ON b.id=s.bill_id
         WHERE b.customer_user_id=$1 AND s.status IN ('open','acknowledged')`,
        [a.actor.id],
      )
    ).rows[0];
    if (pending && Number(pending.count) > 0)
      items.push({
        kind: 'alert',
        title: `${pending.count} support request(s) in review`,
        detail: 'Your support requests are still open. You can add details or track them.',
        action: { label: 'Open support', href: '/support' },
      });

    const wallet = await walletSummary(a.client, a.actor.id);
    const totalAvailable = wallet.currencies.reduce(
      (sum, group) => sum + BigInt(group.balances.available),
      0n,
    );
    if (totalAvailable === 0n)
      items.push({
        kind: 'action',
        title: 'Add funds from your Orange Money wallet',
        detail:
          'You have no available healthcare funds yet. Move money from Orange Money in seconds, or ask family for support.',
        action: { label: 'Add money', href: '/save' },
      });
    else
      items.push({
        kind: 'recommendation',
        title: 'Keep your care fund growing',
        detail:
          'You currently have available healthcare funds. Regular small top-ups keep you ready for care costs.',
        action: { label: 'Add money', href: '/save' },
      });

    const origin = await getLocation(a.client, a.actor.id);
    if (origin) {
      const nearest = await nearbyProviders(a.client, origin, { emergency: true, limit: 1 });
      if (nearest[0]?.distanceKm != null)
        items.push({
          kind: 'recommendation',
          title: `Emergency care ${nearest[0].distanceKm} km away`,
          detail: `${nearest[0].legalName} is your nearest verified emergency provider (about ${nearest[0].etaMinutes} min).`,
          action: { label: 'See nearby care', href: '/pay?nearby=emergency' },
          intent: 'find_providers',
        });
    }

    if (items.length === 0)
      items.push({
        kind: 'recommendation',
        title: 'Nothing needs your attention right now',
        detail:
          'You are all caught up. Upload a provider bill or ask me anything about paying for care.',
        action: { label: 'Pay for care', href: '/pay' },
      });

    return { items, simulationLabel: SIMULATION_LABEL };
  }

  /**
   * Handle one customer turn. Accepts free text and/or an uploaded provider bill
   * (base64) and an optional fresh location. Returns the persisted assistant
   * reply and the stored user message.
   */
  async send(
    a: Access,
    input: {
      text?: string;
      document?: { contentType: string; base64: string };
      location?: LocationInput;
    },
  ): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
    if (input.location) await upsertLocation(a.client, a.actor.id, input.location);
    const text = (input.text ?? '').trim().slice(0, 2000);
    if (!text && !input.document)
      throw new IdentityError(400, 'Send a message or upload a provider bill to continue.');

    const userContent: ChatMessageContent = {
      text: text || (input.document ? 'I uploaded a provider bill.' : ''),
      ...(input.document
        ? {
            document: {
              contentType: input.document.contentType,
              byteSize: this.decode(input.document.base64).length,
            },
          }
        : {}),
    };
    const user = await this.persist(a, 'user', userContent);

    const assistantContent: ChatMessageContent = input.document
      ? await this.handleDocument(a, input.document)
      : await this.handleText(a, text);

    const assistant = await this.persist(a, 'assistant', assistantContent);
    return { user, assistant };
  }

  /** Execute a previously prepared action, after explicit customer approval. */
  async confirm(a: Access, confirmationId: string): Promise<ChatConfirmResult> {
    const row = (
      await a.client.query<{
        id: string;
        actor_user_id: string;
        action: string;
        bill_id: string | null;
        payload: {
          amountMinor?: string;
          currency?: string;
          kind?: 'shortfall_support' | 'help';
          reason?: string;
        };
        status: string;
        expires_at: Date;
        result: unknown;
      }>('SELECT * FROM assistant_confirmations WHERE id=$1 FOR UPDATE', [confirmationId])
    ).rows[0];
    if (!row || row.actor_user_id !== a.actor.id)
      throw new IdentityError(404, 'This confirmation is unavailable.');
    if (row.status === 'confirmed') {
      const stored = row.result as { status?: string; message?: string; redirect?: string | null };
      return {
        id: row.id,
        action: row.action as ChatActionKind,
        status: stored?.redirect ? 'needs_screen' : 'executed',
        message: stored?.message ?? 'This action was already completed.',
        redirect: stored?.redirect ?? null,
        assistant: null,
      };
    }
    if (row.status !== 'pending')
      throw new IdentityError(409, 'This confirmation can no longer be used.');
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await a.client.query("UPDATE assistant_confirmations SET status='expired' WHERE id=$1", [
        row.id,
      ]);
      throw new IdentityError(409, 'This confirmation expired. Ask again to prepare a new one.');
    }

    let result: ChatConfirmResult;
    if (row.action === 'request_support') {
      if (!row.bill_id) throw new IdentityError(409, 'This confirmation is not supported.');
      const created = await this.assistance.requestSupport(a, row.bill_id, {
        kind: row.payload.kind ?? 'help',
        reason: row.payload.reason ?? 'Requested through the assistant',
      });
      result = {
        id: row.id,
        action: 'request_support',
        status: 'executed',
        message:
          'Done — your support request is submitted and a reviewer will look at it. You can add more details any time.',
        redirect: '/support',
        assistant: null,
      };
      await a.client.query(
        "UPDATE assistant_confirmations SET status='confirmed',confirmed_at=now(),result=$2 WHERE id=$1",
        [
          row.id,
          JSON.stringify({
            status: 'confirmed',
            message: result.message,
            redirect: result.redirect,
            created,
          }),
        ],
      );
    } else if (row.action === 'add_funds') {
      const amountMinor = row.payload.amountMinor;
      const currency = row.payload.currency ?? DEFAULT_DEPOSIT_CURRENCY;
      if (!amountMinor) throw new IdentityError(409, 'This confirmation is not supported.');
      const quote = (await this.funding.quote(a.client, a.actor.id, {
        kind: 'deposit',
        amountMinor,
        currency,
        international: false,
      })) as { id: string };
      await this.funding.authorize(a.client, a.actor.id, quote.id);
      const redirect = `/save?topup=${quote.id}&auto=1`;
      result = {
        id: row.id,
        action: 'add_funds',
        status: 'needs_screen',
        message: `Approved. I started your ${currency} ${(Number(amountMinor) / 100).toFixed(2)} top-up from Orange Money. Finish it on the Add money screen and I will bring you back here.`,
        redirect,
        assistant: null,
      };
      await a.client.query(
        "UPDATE assistant_confirmations SET status='confirmed',confirmed_at=now(),result=$2 WHERE id=$1",
        [
          row.id,
          JSON.stringify({
            status: 'confirmed',
            message: result.message,
            redirect,
            paymentId: quote.id,
          }),
        ],
      );
    } else {
      throw new IdentityError(409, 'This confirmation is not supported.');
    }

    await a.audit('chat.action_confirmed', 'assistant_confirmation', row.id, {
      action: row.action,
    });
    const assistant = await this.persist(a, 'assistant', {
      text: result.message,
      ...(result.redirect
        ? {
            items: [
              {
                kind: 'action' as const,
                title: result.action === 'add_funds' ? 'Finish your top-up' : 'Open support',
                detail: result.message,
                action: {
                  label: result.action === 'add_funds' ? 'Add money' : 'Open support',
                  href: result.redirect,
                },
              },
            ],
          }
        : {}),
    });
    return { ...result, assistant };
  }

  private async persist(
    a: Access,
    role: 'user' | 'assistant',
    content: ChatMessageContent,
  ): Promise<ChatMessage> {
    const stored: ChatMessageContent =
      role === 'assistant' ? { ...content, disclaimer: ASSISTANT_DISCLAIMER } : content;
    const row = (
      await a.client.query<{ id: string; created_at: Date }>(
        'INSERT INTO chat_messages(user_id,role,content) VALUES($1,$2,$3) RETURNING id,created_at',
        [a.actor.id, role, JSON.stringify(stored)],
      )
    ).rows[0];
    return { id: row.id, role, content: stored, createdAt: row.created_at.toISOString() };
  }

  private decode(base64: string): Buffer {
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64) || base64.length < 4)
      throw new IdentityError(400, 'The uploaded file could not be read.');
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length) throw new IdentityError(400, 'The uploaded file could not be read.');
    if (bytes.length > MAX_DOCUMENT_BYTES)
      throw new IdentityError(413, 'That file is too large. Keep it under 512 KB.');
    return bytes;
  }

  private async handleDocument(
    a: Access,
    document: { contentType: string; base64: string },
  ): Promise<ChatMessageContent> {
    const contentType = document.contentType.toLowerCase();
    if (!ALLOWED_DOCUMENT_TYPES.has(contentType))
      throw new IdentityError(415, 'Upload a PDF, PNG, JPEG, or plain-text provider bill.');
    const bytes = this.decode(document.base64);

    // Storage keys must match the private-object pattern enforced by the
    // adapters (`private/<uuid>`), which blocks path traversal.
    const stored = await this.adapters.storage.putObject({
      key: `private/${randomUUID()}`,
      bytes,
      contentType,
    });

    let extraction: AiExtractionResult;
    try {
      extraction = await this.adapters.ai.extractFromDocument({
        storageKey: stored.key,
        contentType,
        bytes,
      });
    } catch {
      return {
        text: `I could not read that document. ${SIMULATION_LABEL} You can retry the upload or add the details as text.`,
        document: { contentType, byteSize: bytes.length },
      };
    }

    const summary: ChatExtractionSummary = {
      providerName: extraction.fields.providerName,
      totalAmountMinor: extraction.fields.totalAmountMinor,
      currency: extraction.fields.currency,
      serviceDate: extraction.fields.serviceDate,
      confidence: extraction.confidence,
      unreadable: extraction.unreadable,
      ambiguous: extraction.ambiguous,
    };

    if (extraction.unreadable) {
      return {
        text: `I could not read usable text from that document (the image scanner is not connected in this sandbox, so scanned photos cannot be read yet). ${SIMULATION_LABEL} You can type the provider, amount, and date instead and I will help you next.`,
        document: { contentType, byteSize: bytes.length },
        extraction: summary,
      };
    }

    const review = await this.reviewProvider(a, extraction.fields.providerName);

    const lines: string[] = ['I read that provider bill. Here is what I found:'];
    if (extraction.fields.providerName) lines.push(`Provider: ${extraction.fields.providerName}.`);
    if (extraction.fields.totalAmountMinor != null && extraction.fields.currency)
      lines.push(
        `Total: ${(extraction.fields.totalAmountMinor / 100).toFixed(2)} ${extraction.fields.currency}.`,
      );
    else lines.push('I could not confirm a total, so please double-check it.');
    if (extraction.fields.serviceDate)
      lines.push(`Service date: ${extraction.fields.serviceDate}.`);
    if (
      extraction.derivedTotalMinor != null &&
      extraction.fields.totalAmountMinor != null &&
      extraction.derivedTotalMinor !== extraction.fields.totalAmountMinor
    )
      lines.push(
        'The line items add up to a different total than the printed total, so please confirm which is right.',
      );
    if (extraction.ambiguous.length)
      lines.push(
        `These fields were ambiguous and need your confirmation: ${extraction.ambiguous.join(', ')}.`,
      );

    const verdict: Record<ChatDocumentReview['status'], string> = {
      verified: `Provider check: ${review.notes} I am treating this bill as valid.`,
      expired: `Provider check: ${review.notes} I am treating this bill as expired, so do not pay it until the provider is re-verified.`,
      unverified: `Provider check: ${review.notes} I am treating this bill as invalid for payment for now.`,
      unknown: `Provider check: ${review.notes} I am treating this bill as unverified.`,
    };
    lines.push(verdict[review.status]);
    lines.push(
      review.status === 'verified'
        ? `Review it on the Pay for Care screen to confirm the details, then I can help you fund or pay it. ${SIMULATION_LABEL}`
        : `You can open Pay for Care to review or challenge this bill, but I will not prepare a payment for an expired or unverified provider. ${SIMULATION_LABEL}`,
    );

    const items: ChatItem[] =
      review.status === 'verified'
        ? [
            {
              kind: 'action',
              title: 'Confirm this bill',
              detail: 'Open Pay for Care to confirm the extracted details and continue.',
              action: { label: 'Open Pay for Care', href: '/pay' },
            },
          ]
        : [
            {
              kind: 'alert',
              title:
                review.status === 'expired'
                  ? 'Provider verification expired'
                  : 'Provider is not verified',
              detail: review.notes,
              action: { label: 'Open Pay for Care', href: '/pay' },
            },
          ];

    return {
      text: lines.join(' '),
      document: { contentType, byteSize: bytes.length },
      documentReview: review,
      extraction: summary,
      items,
    };
  }

  /**
   * Match the provider named on a bill against the directory and report whether
   * it is verified, expired, unverified, or unknown. Deterministic — no model.
   */
  private async reviewProvider(
    a: Access,
    providerName: string | null,
  ): Promise<ChatDocumentReview> {
    const rows = (
      await a.client.query<{
        id: string;
        legal_name: string;
        status: string;
        verification_status: string | null;
        method: string | null;
        valid_until: Date | null;
      }>(
        `SELECT p.id,p.legal_name,p.status,v.status AS verification_status,v.method,v.valid_until
         FROM providers p
         LEFT JOIN LATERAL (
           SELECT status,method,valid_until FROM provider_verification_records
           WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1
         ) v ON true`,
      )
    ).rows;
    const candidates: ProviderCandidate[] = rows.map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      providerStatus: row.status,
      verificationStatus: row.verification_status,
      method: row.method,
      validUntil: row.valid_until,
    }));
    return assessProvider(providerName, candidates, new Date());
  }

  private async handleText(a: Access, text: string): Promise<ChatMessageContent> {
    const intent = classifyIntent(text);
    switch (intent) {
      case 'greeting':
        return {
          text: `Hello, I am your LUX HealthWallet assistant. I can add money from your Orange Money wallet, explain your bills and balance, request support, and find verified care you can reach — including the nearest emergency provider. Tell me what you need, or upload a bill and I will take it from there. ${SIMULATION_LABEL}`,
          items: (await this.briefing(a)).items,
        };
      case 'emergency':
        return this.providersReply(a, true);
      case 'add_funds':
        return this.addFundsReply(a, text);
      case 'briefing':
        return this.briefingReply(a);
      case 'fees':
        return this.feesReply();
      case 'support':
        return this.supportReply(a, text);
      case 'bills':
        return this.billsReply(a);
      case 'pay':
        return {
          text: `To pay for care, open Pay for Care, choose a verified provider or one of your bills, confirm the amount, and authorize the payment. I can prepare things for you, but only you can authorize a payment. ${SIMULATION_LABEL}`,
          items: [
            {
              kind: 'action',
              title: 'Go to Pay for Care',
              detail: 'Confirm a bill and authorize a payment.',
              action: { label: 'Pay for Care', href: '/pay' },
            },
          ],
        };
      case 'wallet':
        return this.walletReply(a);
      case 'provider':
        return this.providersReply(a, false, text);
      default:
        return {
          text: `I can add money from Orange Money, check your balance, request support, find verified care near you, explain fees, and read a provider bill. Try "add 5,000 from Orange Money", "find a hospital near me", or upload a bill and I will read it for you. ${SIMULATION_LABEL}`,
          items: (await this.briefing(a)).items,
        };
    }
  }

  private async briefingReply(a: Access): Promise<ChatMessageContent> {
    const { items } = await this.briefing(a);
    const attention = items.filter((i) => i.kind === 'action' || i.kind === 'alert');
    const text =
      attention.length > 0
        ? `Here is what needs your attention: ${attention.map((i) => i.title).join('; ')}. I have listed everything below with a shortcut to each step. ${SIMULATION_LABEL}`
        : `Nothing urgent needs your attention right now. Here is a quick way to keep your care fund ready. ${SIMULATION_LABEL}`;
    return { text, items };
  }

  private async walletReply(a: Access): Promise<ChatMessageContent> {
    const wallet = await walletSummary(a.client, a.actor.id);
    if (!wallet.currencies.length)
      return {
        text: `Your healthcare wallet is empty so far. You can add money from your Orange Money wallet in seconds. ${SIMULATION_LABEL}`,
        items: [
          {
            kind: 'action',
            title: 'Add money from Orange Money',
            detail: 'Move funds into your healthcare wallet.',
            action: { label: 'Add money', href: '/save' },
          },
        ],
      };
    const parts = wallet.currencies.map(
      (g) => `${(Number(g.balances.available) / 100).toFixed(2)} ${g.currency} available`,
    );
    return {
      text: `Your wallet currently holds ${parts.join(' and ')}. Reserved and pending amounts are held separately and are not yet spendable. ${SIMULATION_LABEL}`,
      items: [
        {
          kind: 'action',
          title: 'Open your wallet',
          detail: 'See funding sources and history.',
          action: { label: 'Wallet & history', href: '/history' },
        },
      ],
    };
  }

  private async billsReply(a: Access): Promise<ChatMessageContent> {
    const bills = (
      await a.client.query<{
        id: string;
        status: string;
        currency: string | null;
        total_amount_minor: number | null;
        provider_name: string | null;
      }>(
        `SELECT id,status,currency,total_amount_minor,provider_name FROM bills WHERE customer_user_id=$1 ORDER BY created_at DESC LIMIT 3`,
        [a.actor.id],
      )
    ).rows;
    const intro = bills.length
      ? `You have ${bills.length} recent bill(s). The latest is ${bills[0].provider_name ?? 'from a provider'} for ${
          bills[0].total_amount_minor != null && bills[0].currency
            ? `${(bills[0].total_amount_minor / 100).toFixed(2)} ${bills[0].currency}`
            : 'an unconfirmed amount'
        } (status: ${bills[0].status}).`
      : 'You have no bills on your account yet.';
    return {
      text: `${intro} Upload a provider bill (PDF, PNG, or JPEG) and I will read the provider, amount, and date for you so you do not have to type them. ${SIMULATION_LABEL}`,
      items: [
        {
          kind: 'action',
          title: 'Upload a bill',
          detail: 'Use the attach button in this chat to upload a provider bill.',
          action: { label: 'Pay for Care', href: '/pay' },
        },
      ],
    };
  }

  private feesReply(): ChatMessageContent {
    return {
      text: `Published fees (${FEE_SCHEDULE.version}, ${FEE_SCHEDULE.status}): ${FEE_SCHEDULE.lines
        .map(
          (l) => `${l.label} ${FEE_SCHEDULE.currency} ${(Number(l.amountMinor) / 100).toFixed(2)}`,
        )
        .join('; ')}. ${FEE_SCHEDULE.note} ${SIMULATION_LABEL}`,
      items: [
        {
          kind: 'action',
          title: 'See fees',
          detail: 'Open the service status page for the full fee schedule.',
          action: { label: 'Fees & status', href: '/status' },
        },
      ],
    };
  }

  private async addFundsReply(a: Access, text: string): Promise<ChatMessageContent> {
    const amountMinor = extractAmountMinor(text);
    if (!amountMinor)
      return {
        text: `How much would you like to add to your healthcare wallet from Orange Money? For example, "add 5,000 from Orange Money". ${SIMULATION_LABEL}`,
        items: [
          {
            kind: 'action',
            title: 'Add money',
            detail: 'Open the Add money screen to enter an amount.',
            action: { label: 'Add money', href: '/save' },
          },
        ],
      };
    const confirmation = await this.prepareAction(
      a,
      'add_funds',
      null,
      {
        amountMinor,
        currency: DEFAULT_DEPOSIT_CURRENCY,
        source: 'orange_money',
      },
      `Move ${DEFAULT_DEPOSIT_CURRENCY} ${(Number(amountMinor) / 100).toFixed(2)} from Orange Money into your healthcare wallet`,
    );
    return {
      text: `I can move ${DEFAULT_DEPOSIT_CURRENCY} ${(Number(amountMinor) / 100).toFixed(2)} from your Orange Money wallet into your healthcare wallet. Approve below and I will start it and take you to the Add money screen. ${SIMULATION_LABEL}`,
      items: [
        {
          kind: 'action',
          title: 'Approve this top-up',
          detail: `${DEFAULT_DEPOSIT_CURRENCY} ${(Number(amountMinor) / 100).toFixed(2)} from Orange Money. You can still review it on the next screen.`,
          confirmation,
        },
      ],
    };
  }

  private async supportReply(a: Access, text: string): Promise<ChatMessageContent> {
    const bill = (
      await a.client.query<{ id: string; provider_name: string | null }>(
        `SELECT id,provider_name FROM bills
         WHERE customer_user_id=$1 AND status NOT IN ('paid','failed')
         ORDER BY created_at DESC LIMIT 1`,
        [a.actor.id],
      )
    ).rows[0];
    if (!bill)
      return {
        text: `I can help you ask for support on a care bill. Once you have a bill on your account, tell me and I will prepare the request for your approval. ${SIMULATION_LABEL}`,
        items: [
          {
            kind: 'action',
            title: 'Open Get Support',
            detail: 'Request help and track it.',
            action: { label: 'Get Support', href: '/support' },
          },
        ],
      };
    const reason = text.slice(0, 400);
    const confirmation = await this.prepareAction(
      a,
      'request_support',
      bill.id,
      {
        kind: 'shortfall_support',
        reason,
      },
      `Request support for your ${bill.provider_name ?? 'care'} bill`,
    );
    return {
      text: `I have prepared a support request for your ${bill.provider_name ?? 'care'} bill. Approve it and I will submit it to a reviewer right away. ${SIMULATION_LABEL}`,
      items: [
        {
          kind: 'action',
          title: 'Approve support request',
          detail: reason,
          confirmation,
        },
      ],
    };
  }

  private async providersReply(
    a: Access,
    emergency: boolean,
    text = '',
  ): Promise<ChatMessageContent> {
    const origin = await getLocation(a.client, a.actor.id);
    let providers = await nearbyProviders(a.client, origin, { emergency, limit: 5 });
    if (emergency && providers.length === 0)
      providers = await nearbyProviders(a.client, origin, { emergency: false, limit: 5 });

    const wantsNear = emergency || /near|close|closest/.test(text.toLowerCase());
    if (providers.length === 0)
      return {
        text: `No providers are currently listed as verified. You can still add a bill from any provider and I will help you review it. ${SIMULATION_LABEL}`,
        items: [
          {
            kind: 'action',
            title: 'Provider directory',
            detail: 'Browse providers and start a care payment.',
            action: { label: 'Pay for Care', href: '/pay' },
          },
        ],
        usedLocation: Boolean(origin),
      };

    const nearest = providers[0];
    const prefix = emergency
      ? 'Emergency care you can reach now'
      : 'Verified providers you can reach';
    const nearHint =
      wantsNear && !origin ? ' Share your location and I will order these by distance.' : '';
    const replyText =
      origin && nearest.distanceKm != null
        ? `${prefix}: your nearest is ${nearest.legalName}, ${nearest.distanceKm} km away (about ${nearest.etaMinutes} min). I have listed the closest below. ${SIMULATION_LABEL}`
        : `${prefix}: ${providers.map((p) => p.legalName).join('; ')}.${nearHint} ${SIMULATION_LABEL}`;
    return {
      text: replyText,
      providers,
      usedLocation: Boolean(origin),
      items: [
        {
          kind: 'action',
          title: emergency ? 'Emergency providers' : 'Provider directory',
          detail: 'Open Pay for Care to choose a provider and start a payment.',
          action: {
            label: 'Pay for Care',
            href: emergency ? '/pay?nearby=emergency' : '/pay',
          },
        },
      ],
    };
  }

  private async prepareAction(
    a: Access,
    action: ChatActionKind,
    billId: string | null,
    payload: Record<string, unknown>,
    summary: string,
  ): Promise<ChatConfirmation> {
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
    const row = (
      await a.client.query<{ id: string }>(
        `INSERT INTO assistant_confirmations(actor_user_id,tool,action,bill_id,payload,summary,status,expires_at)
         VALUES($1,'chat',$2,$3,$4,$5,'pending',$6) RETURNING id`,
        [a.actor.id, action, billId, JSON.stringify(payload), summary, expiresAt],
      )
    ).rows[0];
    return { id: row.id, action, summary, expiresAt };
  }
}
