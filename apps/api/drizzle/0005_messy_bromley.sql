CREATE TABLE "funding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"beneficiary_user_id" uuid NOT NULL,
	"goal_id" uuid,
	"support_link_id" uuid,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"categories" text[] NOT NULL,
	"beneficiary_label" text NOT NULL,
	"status" text DEFAULT 'quoted' NOT NULL,
	"adapter_id" text NOT NULL,
	"adapter_mode" text NOT NULL,
	"adapter_reference" text,
	"international" boolean DEFAULT false NOT NULL,
	"quote_expires_at" timestamp with time zone NOT NULL,
	"authorized_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"journal_id" uuid,
	"allocation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_payments_adapter_reference_unique" UNIQUE("adapter_reference"),
	CONSTRAINT "funding_payments_journal_id_unique" UNIQUE("journal_id"),
	CONSTRAINT "funding_payments_allocation_id_unique" UNIQUE("allocation_id"),
	CONSTRAINT "funding_money_valid" CHECK ("funding_payments"."amount_minor">0 AND "funding_payments"."fee_minor">=0),
	CONSTRAINT "funding_status_valid" CHECK ("funding_payments"."status" IN ('quoted','pending','confirmed','failed')),
	CONSTRAINT "funding_kind_valid" CHECK (("funding_payments"."kind"='deposit' AND "funding_payments"."support_link_id" IS NULL AND "funding_payments"."payer_user_id"="funding_payments"."beneficiary_user_id") OR ("funding_payments"."kind"='contribution' AND "funding_payments"."support_link_id" IS NOT NULL AND "funding_payments"."goal_id" IS NULL)),
	CONSTRAINT "funding_confirmation_valid" CHECK (("funding_payments"."status"='confirmed') = ("funding_payments"."journal_id" IS NOT NULL AND "funding_payments"."allocation_id" IS NOT NULL AND "funding_payments"."confirmed_at" IS NOT NULL)),
	CONSTRAINT "funding_mode_valid" CHECK ("funding_payments"."adapter_mode" IN ('sandbox','live'))
);
--> statement-breakpoint
CREATE TABLE "saving_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"target_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_target_positive" CHECK ("saving_goals"."target_minor">0)
);
--> statement-breakpoint
CREATE TABLE "saving_guidance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"weekly_minor" bigint NOT NULL,
	"basis" jsonb NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guidance_amount_positive" CHECK ("saving_guidance"."weekly_minor">0),
	CONSTRAINT "guidance_status_valid" CHECK ("saving_guidance"."status" IN ('suggested','changed','dismissed'))
);
--> statement-breakpoint
CREATE TABLE "support_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"beneficiary_label" text NOT NULL,
	"currencies" text[] NOT NULL,
	"categories" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "funding_events" ADD CONSTRAINT "funding_events_payment_id_funding_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."funding_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_payments" ADD CONSTRAINT "funding_payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_payments" ADD CONSTRAINT "funding_payments_beneficiary_user_id_users_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_payments" ADD CONSTRAINT "funding_payments_goal_id_saving_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."saving_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_payments" ADD CONSTRAINT "funding_payments_support_link_id_support_links_id_fk" FOREIGN KEY ("support_link_id") REFERENCES "public"."support_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_payments" ADD CONSTRAINT "funding_payments_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_payments" ADD CONSTRAINT "funding_payments_allocation_id_funding_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."funding_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saving_goals" ADD CONSTRAINT "saving_goals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saving_guidance" ADD CONSTRAINT "saving_guidance_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saving_guidance" ADD CONSTRAINT "saving_guidance_goal_id_saving_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."saving_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saving_guidance" ADD CONSTRAINT "saving_guidance_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_links" ADD CONSTRAINT "support_links_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "funding_event_unique" ON "funding_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "funding_payer_idx" ON "funding_payments" USING btree ("payer_user_id");--> statement-breakpoint
CREATE INDEX "funding_beneficiary_idx" ON "funding_payments" USING btree ("beneficiary_user_id");--> statement-breakpoint
CREATE FUNCTION guard_funding_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Funding history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['status','adapter_reference','authorized_at','confirmed_at','journal_id','allocation_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','adapter_reference','authorized_at','confirmed_at','journal_id','allocation_id']) THEN RAISE EXCEPTION 'Funding terms are immutable'; END IF;
  IF OLD.status='confirmed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Confirmed funding is immutable'; END IF;
  IF OLD.adapter_reference IS NOT NULL AND NEW.adapter_reference IS DISTINCT FROM OLD.adapter_reference THEN RAISE EXCEPTION 'Provider reference is immutable'; END IF;
  IF OLD.authorized_at IS NOT NULL AND NEW.authorized_at IS DISTINCT FROM OLD.authorized_at THEN RAISE EXCEPTION 'Authorization is immutable'; END IF;
  IF NEW.status='quoted' AND OLD.status<>'quoted' THEN RAISE EXCEPTION 'Cannot reset authorization'; END IF;
 END IF;
 IF NEW.currency NOT IN ('LRD','USD') THEN RAISE EXCEPTION 'Unsupported funding currency'; END IF;
 IF NEW.goal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saving_goals g WHERE g.id=NEW.goal_id AND g.owner_user_id=NEW.beneficiary_user_id AND g.currency=NEW.currency) THEN RAISE EXCEPTION 'Goal beneficiary or currency mismatch'; END IF;
 IF NEW.support_link_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM support_links l WHERE l.id=NEW.support_link_id AND l.owner_user_id=NEW.beneficiary_user_id AND NEW.currency=ANY(l.currencies) AND l.categories=NEW.categories) THEN RAISE EXCEPTION 'Support terms mismatch'; END IF;
 IF NEW.status<>'quoted' AND (NEW.authorized_at IS NULL OR NEW.adapter_reference IS NULL) THEN RAISE EXCEPTION 'Authorization required'; END IF;
 IF NEW.status='confirmed' AND NOT EXISTS(
   SELECT 1 FROM journal_entries j JOIN funding_allocations a ON a.id=NEW.allocation_id
   WHERE j.id=NEW.journal_id AND j.status='posted' AND j.currency=NEW.currency AND j.reference_id=NEW.id AND j.reference_type='funding_payment'
   AND a.beneficiary_user_id=NEW.beneficiary_user_id AND a.currency=NEW.currency AND a.allowed_categories=NEW.categories
   AND (SELECT COALESCE(sum(l.amount_minor),0) FROM journal_lines l JOIN ledger_accounts ac ON ac.id=l.account_id WHERE l.journal_id=j.id AND l.side='credit' AND ac.allocation_id=a.id AND ac.bucket='available')=NEW.amount_minor
 ) THEN RAISE EXCEPTION 'Confirmed payment requires matching posted credit'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER funding_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON funding_payments FOR EACH ROW EXECUTE FUNCTION guard_funding_payment();
--> statement-breakpoint
CREATE FUNCTION guard_support_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN RAISE EXCEPTION 'Support terms are immutable; revoke and create a new link'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER support_terms_guard BEFORE UPDATE OR DELETE ON support_links FOR EACH ROW EXECUTE FUNCTION guard_support_terms();
--> statement-breakpoint
CREATE TRIGGER funding_event_immutable BEFORE UPDATE OR DELETE ON funding_events FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
--> statement-breakpoint
CREATE TRIGGER funding_event_no_truncate BEFORE TRUNCATE ON funding_events EXECUTE FUNCTION ledger_reject_change();
--> statement-breakpoint
CREATE TRIGGER funding_payment_no_truncate BEFORE TRUNCATE ON funding_payments EXECUTE FUNCTION ledger_reject_change();
