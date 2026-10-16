CREATE TABLE "extraction_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"ai_run_id" uuid,
	"field" text NOT NULL,
	"original_value" jsonb,
	"corrected_value" jsonb,
	"actor_user_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "extraction_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "extraction_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "extraction_corrections" ADD CONSTRAINT "extraction_corrections_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_corrections" ADD CONSTRAINT "extraction_corrections_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_corrections" ADD CONSTRAINT "extraction_corrections_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_extraction_reviewed_by_users_id_fk" FOREIGN KEY ("extraction_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER extraction_correction_immutable BEFORE UPDATE OR DELETE ON extraction_corrections FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();