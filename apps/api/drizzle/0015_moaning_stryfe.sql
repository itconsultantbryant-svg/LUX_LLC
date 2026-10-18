CREATE TABLE IF NOT EXISTS "transaction_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"from_user_id" uuid,
	"from_label" text NOT NULL,
	"to_user_id" uuid,
	"to_label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reference" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reversal_of_id" uuid,
	"reversed_by_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_receipts_number_unique" UNIQUE("number"),
	CONSTRAINT "transaction_receipt_valid" CHECK ("transaction_receipts"."kind" IN ('deposit','payment','contribution','transfer','reversal') AND "transaction_receipts"."direction" IN ('credit','debit') AND "transaction_receipts"."status" IN ('completed','revoked','reversed') AND "transaction_receipts"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_pins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "transaction_receipts" ADD CONSTRAINT "transaction_receipts_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_pins" ADD CONSTRAINT "user_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
