ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "authorized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "failure_code" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "last_event_sequence" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "funding_reservations" DROP CONSTRAINT IF EXISTS "reservation_status_valid";--> statement-breakpoint
ALTER TABLE "funding_reservations" ADD CONSTRAINT "reservation_status_valid" CHECK ("status" IN ('active','captured','released','refunded'));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bill_payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"status" text NOT NULL,
	"sequence" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"payload_hash" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text NOT NULL DEFAULT 'received',
	"raw" jsonb NOT NULL,
	CONSTRAINT "bill_payment_event_unique" UNIQUE("provider","event_id")
);--> statement-breakpoint
ALTER TABLE "bill_payment_events" ADD CONSTRAINT "bill_payment_events_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bill_payment_event_intent_idx" ON "bill_payment_events" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text NOT NULL DEFAULT 'requested',
	"reason" text NOT NULL,
	"adapter_reference" text,
	"journal_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_positive" CHECK ("amount_minor" > 0),
	CONSTRAINT "refund_status_valid" CHECK ("status" IN ('requested','succeeded','failed')),
	CONSTRAINT "refund_one_per_intent" UNIQUE("payment_intent_id")
);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
