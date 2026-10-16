CREATE TABLE "bill_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"run_id" uuid,
	"opened_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decision" jsonb,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appeal_status_valid" CHECK ("bill_appeals"."status" IN ('open','upheld','overturned','withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "validation_policies" (
	"version" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"check_name" text NOT NULL,
	"label" text NOT NULL,
	"result" text NOT NULL,
	"severity" text NOT NULL,
	"source" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"missing_info" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_action" text NOT NULL,
	"model_version" text,
	"policy_version" text NOT NULL,
	"field" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_source_valid" CHECK ("validation_results"."source" IN ('deterministic','ai','external')),
	CONSTRAINT "validation_result_valid" CHECK ("validation_results"."result" IN ('pass','info','warn','fail','uncertain','unavailable','not_applicable'))
);
--> statement-breakpoint
CREATE TABLE "validation_reviewer_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"run_id" uuid,
	"review_case_id" uuid,
	"action" text NOT NULL,
	"check_name" text,
	"reason" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"authority_minor" bigint,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"model_version" text NOT NULL,
	"route" text NOT NULL,
	"customer_status" text NOT NULL,
	"overall" text NOT NULL,
	"total_minor" bigint,
	"currency" varchar(3) NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_route_valid" CHECK ("validation_runs"."route" IN ('auto_accept','needs_correction','await_provider','await_review','decline')),
	CONSTRAINT "validation_overall_valid" CHECK ("validation_runs"."overall" IN ('pass','warn','fail','uncertain'))
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "validation_state" text;--> statement-breakpoint
ALTER TABLE "bill_appeals" ADD CONSTRAINT "bill_appeals_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_appeals" ADD CONSTRAINT "bill_appeals_run_id_validation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."validation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_appeals" ADD CONSTRAINT "bill_appeals_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_appeals" ADD CONSTRAINT "bill_appeals_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_run_id_validation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."validation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reviewer_actions" ADD CONSTRAINT "validation_reviewer_actions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reviewer_actions" ADD CONSTRAINT "validation_reviewer_actions_run_id_validation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."validation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reviewer_actions" ADD CONSTRAINT "validation_reviewer_actions_review_case_id_review_cases_id_fk" FOREIGN KEY ("review_case_id") REFERENCES "public"."review_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reviewer_actions" ADD CONSTRAINT "validation_reviewer_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "validation_result_run_idx" ON "validation_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "validation_result_bill_idx" ON "validation_results" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "validation_run_bill_idx" ON "validation_runs" USING btree ("bill_id","created_at");--> statement-breakpoint
CREATE TRIGGER validation_run_immutable BEFORE UPDATE OR DELETE ON validation_runs FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();--> statement-breakpoint
CREATE TRIGGER validation_result_immutable BEFORE UPDATE OR DELETE ON validation_results FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();--> statement-breakpoint
CREATE TRIGGER validation_reviewer_action_immutable BEFORE UPDATE OR DELETE ON validation_reviewer_actions FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();--> statement-breakpoint
INSERT INTO validation_policies(version,status,approved_by,approved_at,rules) VALUES (
  'lux-validation-v1',
  'approved',
  'LUX HealthTrust program office',
  '2026-01-01T00:00:00.000Z',
  $policy${
    "version": "lux-validation-v1",
    "status": "approved",
    "approvedBy": "LUX HealthTrust program office",
    "approvedAt": "2026-01-01T00:00:00.000Z",
    "autoAcceptMaxMinor": "500000",
    "reviewerAuthorityMinor": "250000",
    "nearDuplicateWindowDays": 45,
    "nearDuplicateToleranceBps": 200,
    "nearDuplicateReferenceSimilarity": 0.85,
    "checkRoutes": {
      "required_fields": "needs_correction",
      "bill_arithmetic": "needs_correction",
      "customer_eligibility": "decline",
      "provider_verification": "await_provider",
      "exact_duplicate": "await_review",
      "near_duplicate": "await_review",
      "document_consistency": "await_review",
      "available_funding": "needs_correction",
      "funding_restrictions": "await_review",
      "price_anomaly": "await_review",
      "coverage_eligibility": "await_review",
      "ai_document_analysis": "await_review"
    }
  }$policy$::jsonb
);