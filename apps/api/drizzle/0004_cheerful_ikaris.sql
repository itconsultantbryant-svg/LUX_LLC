CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"document_id" uuid,
	"mode" "adapter_mode" NOT NULL,
	"adapter_id" text NOT NULL,
	"model_version" text NOT NULL,
	"status" text NOT NULL,
	"input_digest" text NOT NULL,
	"output" jsonb,
	"confidence_bps" integer,
	"requires_review" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_confidence_range" CHECK ("ai_runs"."confidence_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "bill_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"total_amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_item_amounts_valid" CHECK ("bill_items"."quantity">0 AND "bill_items"."unit_amount_minor">=0 AND "bill_items"."total_amount_minor"="bill_items"."quantity"::numeric * "bill_items"."unit_amount_minor")
);
--> statement-breakpoint
CREATE TABLE "credit_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"partner_organization_id" uuid NOT NULL,
	"beneficiary_user_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"principal_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"repaid_minor" bigint DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"terms_version" text NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_amounts_valid" CHECK ("credit_records"."principal_minor">0 AND "credit_records"."fee_minor">=0 AND "credit_records"."repaid_minor">=0 AND "credit_records"."repaid_minor"::numeric<="credit_records"."principal_minor"::numeric+"credit_records"."fee_minor")
);
--> statement-breakpoint
CREATE TABLE "currency_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_currency" varchar(3) NOT NULL,
	"to_currency" varchar(3) NOT NULL,
	"from_amount_minor" bigint NOT NULL,
	"to_amount_minor" bigint NOT NULL,
	"rate" numeric(38, 18) NOT NULL,
	"quote_reference" text NOT NULL,
	"from_journal_id" uuid NOT NULL,
	"to_journal_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currency_conversions_from_journal_id_unique" UNIQUE("from_journal_id"),
	CONSTRAINT "currency_conversions_to_journal_id_unique" UNIQUE("to_journal_id"),
	CONSTRAINT "currency_conversions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "conversion_valid" CHECK ("currency_conversions"."from_currency"<>"currency_conversions"."to_currency" AND "currency_conversions"."from_amount_minor">0 AND "currency_conversions"."to_amount_minor">0 AND "currency_conversions"."rate">0)
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opened_by" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"payment_intent_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"resolution" text,
	"adjustment_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_positive" CHECK ("disputes"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE "financial_operations" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"operation" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"source" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"beneficiary_user_id" uuid NOT NULL,
	"dependent_id" uuid,
	"program_id" uuid,
	"contribution_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"allowed_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_provider_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"max_per_payment_minor" bigint,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"program_rule_version" integer,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_source_valid" CHECK ("funding_allocations"."source" IN ('personal_savings','family_contributions','employer_benefits','sponsor_vouchers','rewards','partner_credit')),
	CONSTRAINT "allocation_currency_valid" CHECK ("funding_allocations"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "allocation_limit_positive" CHECK ("funding_allocations"."max_per_payment_minor" > 0),
	CONSTRAINT "allocation_status_valid" CHECK ("funding_allocations"."status" IN ('active','suspended','closed'))
);
--> statement-breakpoint
CREATE TABLE "funding_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reserve_journal_id" uuid NOT NULL,
	"terminal_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_positive" CHECK ("funding_reservations"."amount_minor" > 0),
	CONSTRAINT "reservation_status_valid" CHECK ("funding_reservations"."status" IN ('active','captured','released'))
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"operation" text NOT NULL,
	"description" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"reversal_of" uuid,
	"reference_type" text,
	"reference_id" uuid,
	"actor_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "journal_entries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "journal_entries_reversal_of_unique" UNIQUE("reversal_of"),
	CONSTRAINT "journal_status_valid" CHECK ("journal_entries"."status" IN ('draft','posted')),
	CONSTRAINT "journal_currency_valid" CHECK ("journal_entries"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_line_positive" CHECK ("journal_lines"."amount_minor" > 0),
	CONSTRAINT "journal_line_side_valid" CHECK ("journal_lines"."side" IN ('debit','credit'))
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"allocation_id" uuid,
	"bucket" text,
	"kind" text NOT NULL,
	"normal_side" text NOT NULL,
	"balance_minor" bigint DEFAULT 0 NOT NULL,
	"allow_negative" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "account_currency_valid" CHECK ("ledger_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "account_side_valid" CHECK ("ledger_accounts"."normal_side" IN ('debit','credit')),
	CONSTRAINT "account_kind_valid" CHECK ("ledger_accounts"."kind" IN ('asset','liability','equity','income','expense')),
	CONSTRAINT "account_balance_nonnegative" CHECK ("ledger_accounts"."allow_negative" OR "ledger_accounts"."balance_minor" >= 0),
	CONSTRAINT "account_allocation_bucket_valid" CHECK (("ledger_accounts"."allocation_id" IS NULL AND "ledger_accounts"."bucket" IS NULL) OR ("ledger_accounts"."allocation_id" IS NOT NULL AND "ledger_accounts"."bucket" IN ('available','reserved','pending','restricted') AND "ledger_accounts"."normal_side"='credit' AND "ledger_accounts"."kind"='liability' AND NOT "ledger_accounts"."allow_negative"))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "partner_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid,
	"journal_id" uuid NOT NULL,
	"partner_organization_id" uuid,
	"direction" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text DEFAULT 'expected' NOT NULL,
	"adapter_mode" "adapter_mode" NOT NULL,
	"partner_reference" text,
	"evidence" jsonb,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_positive" CHECK ("partner_settlements"."amount_minor">0),
	CONSTRAINT "settlement_direction_valid" CHECK ("partner_settlements"."direction" IN ('inbound','outbound')),
	CONSTRAINT "settlement_status_valid" CHECK ("partner_settlements"."status" IN ('expected','submitted','confirmed','failed','disputed')),
	CONSTRAINT "settlement_confirmation_evidence" CHECK ("partner_settlements"."status"<>'confirmed' OR ("partner_settlements"."partner_reference" IS NOT NULL AND "partner_settlements"."evidence" IS NOT NULL AND "partner_settlements"."confirmed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"adapter_mode" "adapter_mode" NOT NULL,
	"adapter_reference" text,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_attempt_positive" CHECK ("payment_attempts"."amount_minor">0 AND "payment_attempts"."attempt_number">0)
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"allowed_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_provider_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"max_per_payment_minor" bigint,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_currency_valid" CHECK ("programs"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "program_limit_positive" CHECK ("programs"."max_per_payment_minor" > 0),
	CONSTRAINT "program_status_valid" CHECK ("programs"."status" IN ('draft','active','paused','closed'))
);
--> statement-breakpoint
CREATE TABLE "provider_verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text NOT NULL,
	"evidence_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"license_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "provider_status_valid" CHECK ("providers"."status" IN ('pending','verified','rejected','suspended'))
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"number" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receipts_payment_intent_id_unique" UNIQUE("payment_intent_id"),
	CONSTRAINT "receipts_number_unique" UNIQUE("number"),
	CONSTRAINT "receipt_positive" CHECK ("receipts"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE "review_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"bill_id" uuid,
	"provider_id" uuid,
	"assigned_to" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"decision" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "validation_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"ai_run_id" uuid,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"field" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_allocation_id_unique" UNIQUE("allocation_id"),
	CONSTRAINT "vouchers_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "voucher_positive" CHECK ("vouchers"."amount_minor">0)
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "category" varchar(80) DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_document_id_bill_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."bill_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_records" ADD CONSTRAINT "credit_records_allocation_id_funding_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."funding_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_records" ADD CONSTRAINT "credit_records_partner_organization_id_organizations_id_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_records" ADD CONSTRAINT "credit_records_beneficiary_user_id_users_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_conversions" ADD CONSTRAINT "currency_conversions_from_journal_id_journal_entries_id_fk" FOREIGN KEY ("from_journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_conversions" ADD CONSTRAINT "currency_conversions_to_journal_id_journal_entries_id_fk" FOREIGN KEY ("to_journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_adjustment_journal_id_journal_entries_id_fk" FOREIGN KEY ("adjustment_journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_allocations" ADD CONSTRAINT "funding_allocations_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_allocations" ADD CONSTRAINT "funding_allocations_beneficiary_user_id_users_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_allocations" ADD CONSTRAINT "funding_allocations_dependent_id_dependents_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."dependents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_allocations" ADD CONSTRAINT "funding_allocations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_allocations" ADD CONSTRAINT "funding_allocations_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_reservations" ADD CONSTRAINT "funding_reservations_allocation_id_funding_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."funding_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_reservations" ADD CONSTRAINT "funding_reservations_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_reservations" ADD CONSTRAINT "funding_reservations_reserve_journal_id_journal_entries_id_fk" FOREIGN KEY ("reserve_journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_reservations" ADD CONSTRAINT "funding_reservations_terminal_journal_id_journal_entries_id_fk" FOREIGN KEY ("terminal_journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_allocation_id_funding_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."funding_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_partner_organization_id_organizations_id_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_verification_records" ADD CONSTRAINT "provider_verification_records_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_verification_records" ADD CONSTRAINT "provider_verification_records_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_verification_records" ADD CONSTRAINT "provider_verification_records_evidence_document_id_bill_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."bill_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_settlement_id_partner_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."partner_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_allocation_id_funding_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."funding_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocation_wallet_idx" ON "funding_allocations" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "reservation_intent_idx" ON "funding_reservations" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "journal_line_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "journal_line_journal_idx" ON "journal_lines" USING btree ("journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_bucket_unique" ON "ledger_accounts" USING btree ("allocation_id","bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_partner_reference_unique" ON "partner_settlements" USING btree ("partner_organization_id","partner_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempt_number_unique" ON "payment_attempts" USING btree ("payment_intent_id","attempt_number");
--> statement-breakpoint
-- Database-enforced journal integrity; service code is not the only protection.
ALTER TABLE journal_entries ADD CONSTRAINT journal_reversal_fk FOREIGN KEY (reversal_of) REFERENCES journal_entries(id);
--> statement-breakpoint
CREATE FUNCTION ledger_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable financial history: use a reversal or adjustment' USING ERRCODE='23514'; END $$;
--> statement-breakpoint
CREATE FUNCTION ledger_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation funding_allocations;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.balance_minor<>0 THEN RAISE EXCEPTION 'accounts must start at zero' USING ERRCODE='23514'; END IF;
  IF NEW.allocation_id IS NOT NULL THEN
   SELECT * INTO STRICT allocation FROM funding_allocations WHERE id=NEW.allocation_id;
   IF allocation.currency<>NEW.currency THEN RAISE EXCEPTION 'allocation currency mismatch' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF (to_jsonb(NEW)-'balance_minor') IS DISTINCT FROM (to_jsonb(OLD)-'balance_minor') OR pg_trigger_depth()<2 THEN
   RAISE EXCEPTION 'ledger accounts may only change through posting' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_account_guard BEFORE INSERT OR UPDATE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION ledger_account_guard();
--> statement-breakpoint
CREATE FUNCTION journal_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  SELECT status INTO state FROM journal_entries WHERE id=OLD.journal_id FOR UPDATE;
  IF state='posted' THEN RAISE EXCEPTION 'posted journal lines are immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  SELECT status INTO STRICT state FROM journal_entries WHERE id=NEW.journal_id FOR UPDATE;
  IF state='posted' THEN RAISE EXCEPTION 'posted journal lines are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_line_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION journal_line_guard();
--> statement-breakpoint
CREATE FUNCTION journal_header_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'create journals as drafts' USING ERRCODE='23514'; END IF;
 ELSIF OLD.status='posted' THEN
  RAISE EXCEPTION 'posted journals are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.status='posted' THEN NEW.posted_at=clock_timestamp(); ELSE NEW.posted_at=NULL; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_header_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION journal_header_guard();
--> statement-breakpoint
CREATE FUNCTION journal_apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_row ledger_accounts; delta numeric; original journal_entries;
BEGIN
 IF NEW.status<>'posted' THEN RETURN NEW; END IF;
 IF (SELECT count(*) FROM journal_lines WHERE journal_id=NEW.id)<2 OR
    (SELECT coalesce(sum(CASE WHEN side='debit' THEN amount_minor::numeric ELSE -amount_minor::numeric END),1) FROM journal_lines WHERE journal_id=NEW.id)<>0 THEN
  RAISE EXCEPTION 'journal debits must equal credits and contain at least two lines' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM journal_lines l JOIN ledger_accounts a ON a.id=l.account_id WHERE l.journal_id=NEW.id AND (l.currency<>NEW.currency OR a.currency<>NEW.currency)) THEN
  RAISE EXCEPTION 'mixed currencies require explicit conversion journals' USING ERRCODE='23514';
 END IF;
 IF NEW.reversal_of IS NOT NULL THEN
  SELECT * INTO STRICT original FROM journal_entries WHERE id=NEW.reversal_of FOR SHARE;
  IF original.status<>'posted' OR original.currency<>NEW.currency OR original.id=NEW.id THEN
   RAISE EXCEPTION 'invalid reversal target' USING ERRCODE='23514';
  END IF;
  IF EXISTS(
   SELECT account_id,side,sum(amount_minor::numeric) FROM journal_lines WHERE journal_id=NEW.id GROUP BY account_id,side
   EXCEPT SELECT account_id,CASE side WHEN 'debit' THEN 'credit' ELSE 'debit' END,sum(amount_minor::numeric) FROM journal_lines WHERE journal_id=original.id GROUP BY account_id,side
  ) OR EXISTS(
   SELECT account_id,CASE side WHEN 'debit' THEN 'credit' ELSE 'debit' END,sum(amount_minor::numeric) FROM journal_lines WHERE journal_id=original.id GROUP BY account_id,side
   EXCEPT SELECT account_id,side,sum(amount_minor::numeric) FROM journal_lines WHERE journal_id=NEW.id GROUP BY account_id,side
  ) THEN RAISE EXCEPTION 'reversal must exactly invert the original journal' USING ERRCODE='23514'; END IF;
 END IF;
 -- Stable lock order plus atomic balance checks prevents concurrent overspending.
 FOR account_row IN SELECT * FROM ledger_accounts WHERE id IN(SELECT account_id FROM journal_lines WHERE journal_id=NEW.id) ORDER BY id FOR NO KEY UPDATE LOOP
  SELECT sum(CASE WHEN side=account_row.normal_side THEN amount_minor::numeric ELSE -amount_minor::numeric END) INTO delta FROM journal_lines WHERE journal_id=NEW.id AND account_id=account_row.id;
  UPDATE ledger_accounts SET balance_minor=(balance_minor::numeric+delta)::bigint WHERE id=account_row.id;
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_apply_posting AFTER UPDATE OF status ON journal_entries FOR EACH ROW WHEN (OLD.status='draft' AND NEW.status='posted') EXECUTE FUNCTION journal_apply_posting();
--> statement-breakpoint
CREATE FUNCTION allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wallet wallets; program programs;
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
  RAISE EXCEPTION 'allocation terms are immutable; create a replacement allocation' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT wallet FROM wallets WHERE id=NEW.wallet_id;
 IF wallet.currency<>NEW.currency OR wallet.owner_user_id<>NEW.beneficiary_user_id THEN RAISE EXCEPTION 'allocation wallet beneficiary or currency mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.dependent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dependents WHERE id=NEW.dependent_id AND guardian_user_id=NEW.beneficiary_user_id) THEN RAISE EXCEPTION 'invalid allocation dependent' USING ERRCODE='23514'; END IF;
 IF NEW.program_id IS NOT NULL THEN
  SELECT * INTO STRICT program FROM programs WHERE id=NEW.program_id;
  IF program.currency<>NEW.currency OR NEW.program_rule_version IS DISTINCT FROM program.rule_version THEN RAISE EXCEPTION 'program currency or rules version mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.contribution_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contributions c JOIN bills b ON b.id=c.bill_id WHERE c.id=NEW.contribution_id AND c.currency=NEW.currency AND b.customer_user_id=NEW.beneficiary_user_id) THEN RAISE EXCEPTION 'contribution beneficiary or currency mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.expires_at IS NOT NULL AND NEW.starts_at IS NOT NULL AND NEW.expires_at<=NEW.starts_at THEN RAISE EXCEPTION 'invalid allocation dates' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER allocation_guard BEFORE INSERT OR UPDATE ON funding_allocations FOR EACH ROW EXECUTE FUNCTION allocation_guard();
--> statement-breakpoint
CREATE FUNCTION financial_parent_currency_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_currency text; parent_id uuid;
BEGIN
 parent_id=(to_jsonb(NEW)->>TG_ARGV[1])::uuid;
 IF parent_id IS NOT NULL THEN
  EXECUTE format('SELECT currency FROM %I WHERE id=$1',TG_ARGV[0]) INTO parent_currency USING parent_id;
  IF parent_currency IS NULL OR NEW.currency<>parent_currency THEN RAISE EXCEPTION 'financial parent currency mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bill_item_currency BEFORE INSERT OR UPDATE ON bill_items FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('bills','bill_id');
CREATE TRIGGER intent_currency BEFORE INSERT OR UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('bills','bill_id');
CREATE TRIGGER contribution_currency BEFORE INSERT OR UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('bills','bill_id');
CREATE TRIGGER attempt_currency BEFORE INSERT OR UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('payment_intents','payment_intent_id');
CREATE TRIGGER reservation_currency BEFORE INSERT OR UPDATE ON funding_reservations FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('funding_allocations','allocation_id');
CREATE TRIGGER reservation_intent_currency BEFORE INSERT OR UPDATE ON funding_reservations FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('payment_intents','payment_intent_id');
CREATE TRIGGER settlement_currency BEFORE INSERT OR UPDATE ON partner_settlements FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('journal_entries','journal_id');
CREATE TRIGGER settlement_intent_currency BEFORE INSERT OR UPDATE ON partner_settlements FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('payment_intents','payment_intent_id');
CREATE TRIGGER receipt_currency BEFORE INSERT OR UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('payment_intents','payment_intent_id');
CREATE TRIGGER receipt_settlement_currency BEFORE INSERT OR UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('partner_settlements','settlement_id');
CREATE TRIGGER voucher_currency BEFORE INSERT OR UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('funding_allocations','allocation_id');
CREATE TRIGGER voucher_program_currency BEFORE INSERT OR UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('programs','program_id');
CREATE TRIGGER credit_currency BEFORE INSERT OR UPDATE ON credit_records FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('funding_allocations','allocation_id');
CREATE TRIGGER dispute_currency BEFORE INSERT OR UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION financial_parent_currency_guard('bills','bill_id');
--> statement-breakpoint
CREATE FUNCTION financial_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.currency IS DISTINCT FROM OLD.currency THEN RAISE EXCEPTION 'financial currency is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER wallet_currency_immutable BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION financial_identity_guard();
CREATE TRIGGER program_currency_immutable BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION financial_identity_guard();
CREATE TRIGGER intent_currency_immutable BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION financial_identity_guard();
CREATE TRIGGER contribution_currency_immutable BEFORE UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION financial_identity_guard();
--> statement-breakpoint
CREATE FUNCTION bill_financial_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.currency IS NOT NULL AND NEW.currency IS DISTINCT FROM OLD.currency THEN RAISE EXCEPTION 'bill currency is immutable' USING ERRCODE='23514'; END IF;
 IF (NEW.customer_user_id,NEW.dependent_id,NEW.provider_organization_id,NEW.category,NEW.total_amount_minor) IS DISTINCT FROM (OLD.customer_user_id,OLD.dependent_id,OLD.provider_organization_id,OLD.category,OLD.total_amount_minor) AND EXISTS(SELECT 1 FROM payment_intents WHERE bill_id=OLD.id) THEN RAISE EXCEPTION 'bill payment terms are locked once a payment intent exists' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bill_financial_identity_guard BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION bill_financial_identity_guard();
--> statement-breakpoint
CREATE FUNCTION wallet_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.owner_user_id<>OLD.owner_user_id THEN RAISE EXCEPTION 'wallet owner is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER wallet_owner_guard BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION wallet_owner_guard();
--> statement-breakpoint
CREATE TRIGGER operation_immutable BEFORE UPDATE OR DELETE ON financial_operations FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER legacy_ledger_readonly BEFORE INSERT OR UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER provider_review_immutable BEFORE UPDATE OR DELETE ON provider_verification_records FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER journal_no_truncate BEFORE TRUNCATE ON journal_entries EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER line_no_truncate BEFORE TRUNCATE ON journal_lines EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER account_no_truncate BEFORE TRUNCATE ON ledger_accounts EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER operation_no_truncate BEFORE TRUNCATE ON financial_operations EXECUTE FUNCTION ledger_reject_change();
--> statement-breakpoint
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['wallets','bills','contributions','payment_intents','journal_lines','funding_reservations','bill_items','payment_attempts','partner_settlements','receipts','vouchers','credit_records','disputes'] LOOP
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (currency ~ ''^[A-Z]{3}$'')',tbl,tbl||'_iso_currency');
 END LOOP;
END $$;
ALTER TABLE contributions ADD CONSTRAINT contribution_amount_positive CHECK(amount_minor>0);
ALTER TABLE payment_intents ADD CONSTRAINT intent_amount_positive CHECK(amount_minor>0);
ALTER TABLE bills ADD CONSTRAINT bill_amount_nonnegative CHECK(total_amount_minor>=0);
--> statement-breakpoint
ALTER TABLE bills ADD CONSTRAINT bill_amount_requires_currency CHECK(total_amount_minor IS NULL OR currency IS NOT NULL);
--> statement-breakpoint
CREATE FUNCTION program_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.allowed_categories,NEW.allowed_provider_ids,NEW.max_per_payment_minor,NEW.rules,NEW.starts_at,NEW.expires_at) IS DISTINCT FROM (OLD.allowed_categories,OLD.allowed_provider_ids,OLD.max_per_payment_minor,OLD.rules,OLD.starts_at,OLD.expires_at) AND NEW.rule_version<=OLD.rule_version THEN
  RAISE EXCEPTION 'changed program rules require a new version' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER program_version_guard BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION program_version_guard();
--> statement-breakpoint
CREATE FUNCTION conversion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source journal_entries; destination journal_entries; source_amount numeric; destination_amount numeric;
BEGIN
 SELECT * INTO STRICT source FROM journal_entries WHERE id=NEW.from_journal_id;
 SELECT * INTO STRICT destination FROM journal_entries WHERE id=NEW.to_journal_id;
 SELECT sum(amount_minor::numeric) INTO source_amount FROM journal_lines WHERE journal_id=source.id AND side='debit';
 SELECT sum(amount_minor::numeric) INTO destination_amount FROM journal_lines WHERE journal_id=destination.id AND side='debit';
 IF source.status<>'posted' OR destination.status<>'posted' OR source.currency<>NEW.from_currency OR destination.currency<>NEW.to_currency OR source.operation<>'currency_conversion' OR destination.operation<>'currency_conversion' OR source_amount<>NEW.from_amount_minor OR destination_amount<>NEW.to_amount_minor OR round(NEW.from_amount_minor::numeric*NEW.rate)<>NEW.to_amount_minor THEN
  RAISE EXCEPTION 'conversion requires matching posted journals and an exact minor-unit quote' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conversion_guard BEFORE INSERT ON currency_conversions FOR EACH ROW EXECUTE FUNCTION conversion_guard();
CREATE TRIGGER conversion_immutable BEFORE UPDATE OR DELETE ON currency_conversions FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
--> statement-breakpoint
CREATE FUNCTION conversion_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='posted' AND NEW.operation='currency_conversion' AND NOT EXISTS(SELECT 1 FROM currency_conversions WHERE from_journal_id=NEW.id OR to_journal_id=NEW.id) THEN
  RAISE EXCEPTION 'conversion journals require an explicit conversion record in the same transaction' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER conversion_journal_guard AFTER UPDATE ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION conversion_journal_guard();
--> statement-breakpoint
CREATE FUNCTION receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settlement partner_settlements;
BEGIN
 SELECT * INTO STRICT settlement FROM partner_settlements WHERE id=NEW.settlement_id;
 IF settlement.payment_intent_id IS DISTINCT FROM NEW.payment_intent_id OR NEW.amount_minor<>settlement.amount_minor OR (NEW.status='issued' AND settlement.status<>'confirmed') THEN
  RAISE EXCEPTION 'receipt must match its settlement; issued receipts require confirmation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_guard BEFORE INSERT OR UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION receipt_guard();
--> statement-breakpoint
ALTER TABLE ledger_accounts ADD CONSTRAINT account_bucket_required CHECK ((allocation_id IS NULL)=(bucket IS NULL));
--> statement-breakpoint
CREATE FUNCTION intent_terms_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.bill_id,NEW.amount_minor,NEW.currency,NEW.adapter_mode,NEW.idempotency_key) IS DISTINCT FROM (OLD.bill_id,OLD.amount_minor,OLD.currency,OLD.adapter_mode,OLD.idempotency_key) THEN
  RAISE EXCEPTION 'payment intent terms are immutable; create a new intent' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER intent_terms_guard BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION intent_terms_guard();
