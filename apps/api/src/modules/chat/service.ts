import { ASSISTANT_DISCLAIMER, type AiExtractionResult } from '@healthwallet/shared';
import { IdentityError } from '../identity/service.js';
import type { Access } from '../security/access.js';
import type { Adapters } from '../../adapters/index.js';
import { walletSummary } from '../ledger/wallet.js';
import { FEE_SCHEDULE } from '@healthwallet/shared';

export type ChatAction = { label: string; href: string };

export type ChatItem = {
  kind: 'alert' | 'recommendation' | 'action';
  title: string;
  detail: string;
  action?: ChatAction;
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
  extraction?: ChatExtractionSummary;
  items?: ChatItem[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: ChatMessageContent;
  createdAt: string;
};

const SIMULATION_LABEL =
  'SIMULATION — sandbox assistant; no real money moves and nothing is verified.';
const MAX_DOCUMENT_BYTES = 512 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

/**
 * Conversational assistant over the customer's own records. It answers free-form
 * prompts, reads a uploaded provider bill through the AI extraction adapter, and
 * produces a briefing of alerts, recommendations and actions that need attention.
 * It never moves money or authorizes payments; consequential steps only point the
 * customer at the screen that performs them.
 */
export class ChatService {
  constructor(private readonly adapters: Adapters) {}

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
        kind: 'recommendation',
        title: 'Add funds to your wallet',
        detail:
          'You have no available healthcare funds yet. Save a little or ask family for support.',
        action: { label: 'Save or get support', href: '/save' },
      });
    else
      items.push({
        kind: 'recommendation',
        title: 'Keep your care fund growing',
        detail: `You currently have available healthcare funds. Regular small contributions keep you ready for care costs.`,
        action: { label: 'Manage savings', href: '/save' },
      });

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
   * (base64). Returns the persisted assistant reply and the stored user message.
   */
  async send(
    a: Access,
    input: { text?: string; document?: { contentType: string; base64: string } },
  ): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
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

    const stored = await this.adapters.storage.putObject({
      key: `chat/${a.actor.id}/${Date.now()}-bill`,
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
    lines.push(
      `Review it on the Pay for Care screen to confirm the details, then I can help you fund or pay it. ${SIMULATION_LABEL}`,
    );

    return {
      text: lines.join(' '),
      document: { contentType, byteSize: bytes.length },
      extraction: summary,
      items: [
        {
          kind: 'action',
          title: 'Confirm this bill',
          detail: 'Open Pay for Care to confirm the extracted details and continue.',
          action: { label: 'Open Pay for Care', href: '/pay' },
        },
      ],
    };
  }

  private async handleText(a: Access, text: string): Promise<ChatMessageContent> {
    const q = text.toLowerCase();

    if (/^(hi|hello|hey|howdy|good (morning|afternoon|evening)|start)\b/.test(q) || q === 'help')
      return {
        text: `Hello, I am your LUX HealthWallet assistant. I can explain your bills and wallet, help you save or ask for support, find verified providers, and read a provider bill you upload. Tell me what you need, or upload a bill and I will take it from there. ${SIMULATION_LABEL}`,
        items: (await this.briefing(a)).items,
      };

    if (
      /(what should i do|next step|recommend|advice|suggest|plan|tip|status|check|update|alert|attention)/.test(
        q,
      )
    )
      return this.briefingReply(a);

    if (/(wallet|balance|fund|money|saving|save|deposit|how much)/.test(q))
      return this.walletReply(a);

    if (/(bill|invoice|receipt|upload|document|scan|photo)/.test(q)) return this.billsReply(a);

    if (/(pay|payment|authorize|checkout)/.test(q))
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

    if (/(provider|hospital|clinic|doctor|pharmacy|find)/.test(q)) return this.providersReply(a);

    if (/(fee|charge|cost of|how much do you)/.test(q))
      return {
        text: `Published fees (${FEE_SCHEDULE.version}, ${FEE_SCHEDULE.status}): ${FEE_SCHEDULE.lines.map((l) => `${l.label} ${FEE_SCHEDULE.currency} ${(Number(l.amountMinor) / 100).toFixed(2)}`).join('; ')}. ${FEE_SCHEDULE.note} ${SIMULATION_LABEL}`,
        items: [
          {
            kind: 'action',
            title: 'See fees',
            detail: 'Open the service status page for the full fee schedule.',
            action: { label: 'Fees & status', href: '/status' },
          },
        ],
      };

    if (/(support|help me|human|agent|shortfall|can't afford|cannot afford|assist)/.test(q))
      return {
        text: `If a bill costs more than you have, I can help you ask for support. Open Get Support, pick the bill, and describe what you need; a reviewer will look at it. You can also ask family to contribute. ${SIMULATION_LABEL}`,
        items: [
          {
            kind: 'action',
            title: 'Open Get Support',
            detail: 'Request help with a shortfall.',
            action: { label: 'Get Support', href: '/support' },
          },
        ],
      };

    return {
      text: `I can help with your bills, wallet, saving, support requests, verified providers, and fees. Try asking "what should I do next", "what is my wallet balance", "find a provider", or upload a provider bill and I will read it for you. ${SIMULATION_LABEL}`,
      items: (await this.briefing(a)).items,
    };
  }

  private async briefingReply(a: Access): Promise<ChatMessageContent> {
    const { items } = await this.briefing(a);
    const attention = items.filter((i) => i.kind === 'action' || i.kind === 'alert');
    const text =
      attention.length > 0
        ? `Here is what needs your attention: ${attention.map((i) => i.title).join('; ')}. I have listed everything below with a shortcut to each screen. ${SIMULATION_LABEL}`
        : `Nothing urgent needs your attention right now. Here is a quick way to keep your care fund ready. ${SIMULATION_LABEL}`;
    return { text, items };
  }

  private async walletReply(a: Access): Promise<ChatMessageContent> {
    const wallet = await walletSummary(a.client, a.actor.id);
    if (!wallet.currencies.length)
      return {
        text: `Your healthcare wallet is empty so far. You can add savings or ask family to contribute, and your funds will appear here. ${SIMULATION_LABEL}`,
        items: [
          {
            kind: 'action',
            title: 'Save or get support',
            detail: 'Add funds to your care wallet.',
            action: { label: 'Save', href: '/save' },
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

  private async providersReply(a: Access): Promise<ChatMessageContent> {
    const rows = (
      await a.client.query<{ legal_name: string; license_number: string }>(
        `SELECT p.legal_name,p.license_number FROM providers p
         JOIN organizations o ON o.id=p.organization_id
         JOIN LATERAL (SELECT * FROM provider_verification_records WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) v ON true
         WHERE p.status='verified' AND o.status='approved' AND v.status='verified' AND v.method='registry_check' AND v.valid_until>now()
         ORDER BY p.legal_name LIMIT 10`,
      )
    ).rows;
    const text = rows.length
      ? `Verified providers: ${rows.map((r) => r.legal_name).join('; ')}. Only providers with a current registry verification are listed.`
      : 'No providers are currently listed as verified. You can still add a bill from any provider and I will help you review it.';
    return {
      text: `${text} ${SIMULATION_LABEL}`,
      items: [
        {
          kind: 'action',
          title: 'Provider directory',
          detail: 'Browse providers and start a care payment.',
          action: { label: 'Pay for Care', href: '/pay' },
        },
      ],
    };
  }
}
