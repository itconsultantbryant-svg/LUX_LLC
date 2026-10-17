import { z } from 'zod';
import { LocationInputSchema, NearbyProviderSchema } from './location.js';

export const CHAT_MAX_DOCUMENT_CHARS = 700_000;

/**
 * Client-side instructions the assistant can ask the app to perform without an
 * approval gate (read-only or navigational). Consequential actions always go
 * through a `ChatConfirmation` instead.
 */
export const CHAT_ITEM_INTENTS = ['find_providers', 'show_briefing', 'open_wallet'] as const;
export const ChatItemIntentSchema = z.enum(CHAT_ITEM_INTENTS);
export type ChatItemIntent = z.infer<typeof ChatItemIntentSchema>;

/**
 * Actions the assistant can execute after the customer explicitly approves.
 * Every execution is idempotent and audited; the assistant never moves money on
 * its own.
 */
export const CHAT_ACTION_KINDS = [
  'request_support',
  'add_funds',
  'reserve_funds',
  'confirm_bill',
] as const;
export const ChatActionKindSchema = z.enum(CHAT_ACTION_KINDS);
export type ChatActionKind = z.infer<typeof ChatActionKindSchema>;

export const ChatConfirmationSchema = z.object({
  id: z.string(),
  action: ChatActionKindSchema,
  summary: z.string().min(1).max(400),
  expiresAt: z.string(),
});
export type ChatConfirmation = z.infer<typeof ChatConfirmationSchema>;

export const ChatDocumentSchema = z.object({
  contentType: z
    .string()
    .refine(
      (value) =>
        ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(value.toLowerCase()),
      { message: 'Upload a PDF, PNG, JPEG, or plain-text provider bill.' },
    ),
  filename: z.string().trim().max(200).optional(),
  base64: z.string().min(4).max(CHAT_MAX_DOCUMENT_CHARS, {
    message: 'That image is too large. Try a smaller photo or a PDF under 512 KB.',
  }),
});

export const ChatSendRequestSchema = z
  .object({
    text: z.string().trim().max(2000).optional(),
    document: ChatDocumentSchema.optional(),
    /** Optional latest device location so the assistant can suggest reachable care. */
    location: LocationInputSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.text?.trim()) || Boolean(value.document), {
    message: 'Send a message or upload a provider bill.',
  });

export type ChatSendRequest = z.infer<typeof ChatSendRequestSchema>;

export const ChatItemSchema = z.object({
  kind: z.enum(['alert', 'recommendation', 'action']),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(600),
  action: z
    .object({ label: z.string().min(1).max(60), href: z.string().min(1).max(200) })
    .optional(),
  /** Present when the item needs an explicit approval before it runs. */
  confirmation: ChatConfirmationSchema.optional(),
  /** Present when the item asks the app to run a read-only client instruction. */
  intent: ChatItemIntentSchema.optional(),
});

export const CHAT_PROVIDER_STATUSES = ['verified', 'expired', 'unverified', 'unknown'] as const;

/**
 * The assistant's read on an uploaded provider bill: which provider it belongs
 * to and whether that provider is currently verified. `unknown` means no
 * directory provider matched the name; `unverified` means a match exists but its
 * registry verification is not currently valid; `expired` means it was verified
 * but the validity window has passed.
 */
export const ChatDocumentReviewSchema = z.object({
  providerName: z.string().nullable(),
  status: z.enum(CHAT_PROVIDER_STATUSES),
  matchedProviderId: z.string().nullable(),
  matchedProviderName: z.string().nullable(),
  validUntil: z.string().nullable(),
  notes: z.string(),
});
export type ChatDocumentReview = z.infer<typeof ChatDocumentReviewSchema>;

export const ChatMessageContentSchema = z.object({
  text: z.string(),
  disclaimer: z.string().max(400).optional(),
  document: z
    .object({ contentType: z.string().max(60), byteSize: z.number().int().nonnegative() })
    .optional(),
  documentReview: ChatDocumentReviewSchema.optional(),
  extraction: z
    .object({
      providerName: z.string().nullable(),
      totalAmountMinor: z.number().int().nullable(),
      currency: z.string().nullable(),
      serviceDate: z.string().nullable(),
      confidence: z.number(),
      unreadable: z.boolean(),
      ambiguous: z.array(z.string()),
    })
    .optional(),
  items: z.array(ChatItemSchema).optional(),
  /** Structured, verified providers the assistant surfaced (nearest first). */
  providers: z.array(NearbyProviderSchema).optional(),
  /** True when the reply used the customer's stored location to rank providers. */
  usedLocation: z.boolean().optional(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: ChatMessageContentSchema,
  createdAt: z.string(),
});

export const ChatHistoryResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
  simulationLabel: z.string(),
});
export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponseSchema>;

export const ChatBriefingResponseSchema = z.object({
  items: z.array(ChatItemSchema),
  simulationLabel: z.string(),
});
export type ChatBriefingResponse = z.infer<typeof ChatBriefingResponseSchema>;

export const ChatSendResponseSchema = z.object({
  user: ChatMessageSchema,
  assistant: ChatMessageSchema,
  simulationLabel: z.string(),
});
export type ChatSendResponse = z.infer<typeof ChatSendResponseSchema>;

export const ChatConfirmRequestSchema = z
  .object({ confirmationId: z.string().min(1).max(80) })
  .strict();
export type ChatConfirmRequest = z.infer<typeof ChatConfirmRequestSchema>;

export const ChatConfirmResponseSchema = z.object({
  id: z.string(),
  action: ChatActionKindSchema,
  status: z.enum(['executed', 'needs_screen']),
  message: z.string(),
  /** Deep link to the screen that completes the action, when required. */
  redirect: z.string().nullable(),
  /** Follow-up assistant message persisted and appended to the transcript. */
  assistant: ChatMessageSchema.nullable(),
});
export type ChatConfirmResponse = z.infer<typeof ChatConfirmResponseSchema>;

export type ChatItem = z.infer<typeof ChatItemSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatMessageContent = z.infer<typeof ChatMessageContentSchema>;
