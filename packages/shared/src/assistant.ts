import { z } from 'zod';
import { ASSISTANCE_ACTIONS } from './assistance.js';

/**
 * Grounded support assistant.
 *
 * The assistant may only answer from records the signed-in actor is authorized
 * to read, and from approved product information. It never receives payment
 * credentials, and any consequential action (moving funds, applying a voucher,
 * submitting a request) is prepared for explicit user confirmation rather than
 * performed silently.
 */
export const ASSISTANT_TOOLS = [
  'explain_bill_status',
  'explain_funding_sources',
  'find_providers',
  'explain_fees',
  'navigate',
  'prepare_support_request',
] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];
export const AssistantToolSchema = z.enum(ASSISTANT_TOOLS);

export const ASSISTANT_TOOL_LABELS: Record<AssistantTool, string> = {
  explain_bill_status: 'Explain a bill status',
  explain_funding_sources: 'Explain funding sources',
  find_providers: 'Find verified providers',
  explain_fees: 'Explain published fees',
  navigate: 'Help me navigate',
  prepare_support_request: 'Prepare a support request',
};

export const ASSISTANT_OUTCOMES = [
  'answered',
  'needs_confirmation',
  'escalated',
  'unavailable',
] as const;
export type AssistantOutcome = (typeof ASSISTANT_OUTCOMES)[number];
export const AssistantOutcomeSchema = z.enum(ASSISTANT_OUTCOMES);

/** An authorized record the answer is grounded in. */
export const AssistantSourceSchema = z.object({
  kind: z.string().min(1).max(64),
  id: z.string().min(1).max(200).nullable().default(null),
  label: z.string().min(1).max(200),
});
export type AssistantSource = z.infer<typeof AssistantSourceSchema>;

/** A pending action the user must explicitly confirm before it is performed. */
export const AssistantConfirmationSchema = z.object({
  id: z.string(),
  tool: AssistantToolSchema,
  action: z.enum(ASSISTANCE_ACTIONS),
  summary: z.string().max(500),
  expiresAt: z.string(),
});
export type AssistantConfirmation = z.infer<typeof AssistantConfirmationSchema>;

export const AssistantAnswerSchema = z.object({
  tool: AssistantToolSchema,
  outcome: AssistantOutcomeSchema,
  text: z.string().max(2000),
  groundedOn: z.array(z.string()),
  sources: z.array(AssistantSourceSchema),
  recommendedAction: z.enum(ASSISTANCE_ACTIONS).nullable().default(null),
  confirmation: AssistantConfirmationSchema.nullable().default(null),
  canEscalate: z.boolean().default(true),
  disclaimer: z.string(),
  simulationLabel: z.string().nullable().default(null),
  generatedBy: z.enum(['assistant', 'deterministic']).default('deterministic'),
});
export type AssistantAnswer = z.infer<typeof AssistantAnswerSchema>;

export const ASSISTANT_DISCLAIMER =
  'Answers are generated from approved records you are authorized to view. This is not financial, legal or medical advice, and the assistant cannot authorize payments or move funds.';

export const ASSISTANT_ESCALATION_NOTE =
  'A human support agent will follow up. The assistant did not have enough authorized evidence to answer confidently.';

export const ASSISTANT_UNAVAILABLE_NOTE =
  'That information is not available in the records you can access, so the assistant will not guess it.';

export const ASSISTANT_ACTION_REQUIRES_CONFIRMATION =
  'This action changes your account. Review the details and confirm before it is performed.';

/** Request body accepted by the assistant endpoint. */
export const AssistantRequestSchema = z
  .object({
    tool: AssistantToolSchema,
    billId: z.uuid().optional(),
    query: z.string().trim().max(500).optional(),
    providerName: z.string().trim().max(120).optional(),
    supportKind: z.enum(['shortfall_support', 'help']).optional(),
    supportReason: z.string().trim().min(8).max(500).optional(),
  })
  .strict();
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;
