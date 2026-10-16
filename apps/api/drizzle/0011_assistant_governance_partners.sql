ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "budget_minor" bigint;--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT IF EXISTS "program_status_valid";--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "program_status_valid" CHECK ("status" IN ('draft','pending_approval','active','paused','closed'));--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "program_budget_positive" CHECK ("budget_minor" IS NULL OR "budget_minor" > 0);--> statement-breakpoint
ALTER TABLE "credit_records" ADD COLUMN IF NOT EXISTS "terms" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "credit_records" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_records" ADD COLUMN IF NOT EXISTS "appeal" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"action" text NOT NULL,
	"bill_id" uuid,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"result" jsonb,
	CONSTRAINT "assistant_confirmation_status_valid" CHECK ("status" IN ('pending','confirmed','cancelled','expired'))
);--> statement-breakpoint
ALTER TABLE "assistant_confirmations" ADD CONSTRAINT "assistant_confirmations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_confirmations" ADD CONSTRAINT "assistant_confirmations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"requested_by" uuid,
	"required_role" text NOT NULL,
	"change_type" text NOT NULL,
	"change_payload" jsonb NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"decided_by" uuid,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "program_approval_status_valid" CHECK ("status" IN ('pending','approved','rejected'))
);--> statement-breakpoint
ALTER TABLE "program_approvals" ADD CONSTRAINT "program_approvals_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_approval_program_idx" ON "program_approvals" USING btree ("program_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insurance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insurer_organization_id" uuid NOT NULL,
	"beneficiary_user_id" uuid NOT NULL,
	"policy_number" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"coverage" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"verified_method" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurance_policy_number_unique" UNIQUE("insurer_organization_id","policy_number"),
	CONSTRAINT "insurance_policy_status_valid" CHECK ("status" IN ('active','lapsed','cancelled'))
);--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_insurer_fk" FOREIGN KEY ("insurer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_beneficiary_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insurance_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"prepared_by" uuid NOT NULL,
	"status" text NOT NULL DEFAULT 'preparing',
	"amount_claimed_minor" bigint NOT NULL,
	"amount_approved_minor" bigint,
	"currency" varchar(3) NOT NULL,
	"insurer_reference" text,
	"decision" jsonb,
	"submitted_at" timestamp with time zone,
	"decision_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurance_claim_amount_positive" CHECK ("amount_claimed_minor" > 0),
	CONSTRAINT "insurance_claim_status_valid" CHECK ("status" IN ('preparing','submitted','insurer_review','approved','partially_approved','denied','appealed','paid'))
);--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_policy_id_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reward_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"bps" integer,
	"flat_minor" bigint,
	"terms" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"status" text NOT NULL DEFAULT 'active',
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_rule_kind_valid" CHECK ("kind" IN ('per_transaction_bps','flat_per_transaction','campaign'))
);--> statement-breakpoint
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reward_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"beneficiary_user_id" uuid NOT NULL,
	"allocation_id" uuid,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_entry_type_valid" CHECK ("type" IN ('accrual','redemption','reversal','expiry')),
	CONSTRAINT "reward_entry_positive" CHECK ("amount_minor" > 0)
);--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_rule_id_reward_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."reward_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_beneficiary_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_allocation_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."funding_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ussd_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_code" text NOT NULL,
	"phone" text NOT NULL,
	"actor_user_id" uuid,
	"state" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"last_screen" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ussd_session_code_unique" UNIQUE("session_code")
);--> statement-breakpoint
ALTER TABLE "ussd_sessions" ADD CONSTRAINT "ussd_sessions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
