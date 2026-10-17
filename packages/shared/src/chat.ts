import { z } from 'zod';

export const CHAT_MAX_DOCUMENT_CHARS = 700_000;

export const ChatDocumentSchema = z.object({
  contentType: z
    .string()
    .refine(
      (value) =>
        ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(value.toLowerCase()),
      { message: 'Upload a PDF, PNG, JPEG, or plain-text provider bill.' },
    ),
  filename: z.string().trim().max(200).optional(),
  base64: z.string().min(4).max(CHAT_MAX_DOCUMENT_CHARS),
});

export const ChatSendRequestSchema = z
  .object({
    text: z.string().trim().max(2000).optional(),
    document: ChatDocumentSchema.optional(),
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
});

export const ChatMessageContentSchema = z.object({
  text: z.string(),
  disclaimer: z.string().max(400).optional(),
  document: z
    .object({ contentType: z.string().max(60), byteSize: z.number().int().nonnegative() })
    .optional(),
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

export type ChatItem = z.infer<typeof ChatItemSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatMessageContent = z.infer<typeof ChatMessageContentSchema>;
