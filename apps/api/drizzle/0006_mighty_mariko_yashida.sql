CREATE TABLE "bill_change_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"evidence_document_id" uuid,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_confirmation_kind" CHECK ("bill_confirmations"."kind" IN ('customer','invoice','service'))
);
--> statement-breakpoint
CREATE TABLE "bill_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"requested_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"proposed_items" jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"reference" text NOT NULL,
	"issue_date" text NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_name" text NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"items" jsonb NOT NULL,
	"total_minor" bigint NOT NULL,
	"requires_documents" boolean DEFAULT true NOT NULL,
	"confirmation_kind" text DEFAULT 'invoice' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_revision_positive" CHECK ("bill_revisions"."revision">0 AND "bill_revisions"."total_minor">0),
	CONSTRAINT "confirmation_kind_valid" CHECK ("bill_revisions"."confirmation_kind" IN ('invoice','service'))
);
--> statement-breakpoint
CREATE TABLE "provider_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"dependent_id" uuid,
	"provider_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_associations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "bill_documents" ADD COLUMN "revision_number" integer;--> statement-breakpoint
ALTER TABLE "bill_documents" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "provider_verification_records" ADD COLUMN "method" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_verification_records" ADD COLUMN "evidence_reference" text;--> statement-breakpoint
ALTER TABLE "provider_verification_records" ADD COLUMN "verified_details" jsonb;--> statement-breakpoint
ALTER TABLE "provider_verification_records" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bill_change_history" ADD CONSTRAINT "bill_change_history_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_confirmations" ADD CONSTRAINT "bill_confirmations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_confirmations" ADD CONSTRAINT "bill_confirmations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_confirmations" ADD CONSTRAINT "bill_confirmations_evidence_document_id_bill_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."bill_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_corrections" ADD CONSTRAINT "bill_corrections_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_corrections" ADD CONSTRAINT "bill_corrections_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_associations" ADD CONSTRAINT "provider_associations_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_associations" ADD CONSTRAINT "provider_associations_dependent_id_dependents_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."dependents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_associations" ADD CONSTRAINT "provider_associations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_confirmation_unique" ON "bill_confirmations" USING btree ("bill_id","revision","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_revision_unique" ON "bill_revisions" USING btree ("bill_id","revision");--> statement-breakpoint
ALTER TABLE "bill_documents" ADD CONSTRAINT "bill_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE bill_documents ADD CONSTRAINT document_revision_fk FOREIGN KEY(bill_id,revision_number) REFERENCES bill_revisions(bill_id,revision);
ALTER TABLE bill_confirmations ADD CONSTRAINT confirmation_revision_fk FOREIGN KEY(bill_id,revision) REFERENCES bill_revisions(bill_id,revision);
ALTER TABLE bill_corrections ADD CONSTRAINT correction_revision_fk FOREIGN KEY(bill_id,revision) REFERENCES bill_revisions(bill_id,revision);
--> statement-breakpoint
CREATE FUNCTION provider_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.method='registry_check' THEN
  IF NEW.status NOT IN ('verified','rejected','suspended') OR length(trim(COALESCE(NEW.evidence_reference,'')))<8 OR length(trim(NEW.note))<8
   OR NOT EXISTS(SELECT 1 FROM user_roles r JOIN users u ON u.id=r.user_id WHERE r.user_id=NEW.reviewer_user_id AND r.role='platform_admin' AND u.suspended_at IS NULL)
   OR EXISTS(SELECT 1 FROM providers p JOIN organizations o ON o.id=p.organization_id WHERE p.id=NEW.provider_id AND (o.created_by=NEW.reviewer_user_id OR EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=o.id AND m.user_id=NEW.reviewer_user_id)))
   OR (NEW.status='verified' AND (NEW.valid_until IS NULL OR NEW.valid_until<=now() OR NEW.verified_details IS NULL)) THEN RAISE EXCEPTION 'Authorized independent verification with external evidence is required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER provider_review_authority BEFORE INSERT ON provider_verification_records FOR EACH ROW EXECUTE FUNCTION provider_review_guard();
--> statement-breakpoint
CREATE FUNCTION provider_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='verified' AND (NEW.status,NEW.legal_name,NEW.license_number,NEW.address) IS DISTINCT FROM (OLD.status,OLD.legal_name,OLD.license_number,OLD.address) AND NOT EXISTS(SELECT 1 FROM provider_verification_records v WHERE v.id=(SELECT id FROM provider_verification_records WHERE provider_id=NEW.id ORDER BY created_at DESC,id DESC LIMIT 1) AND v.method='registry_check' AND v.status='verified' AND v.valid_until>now() AND v.verified_details=jsonb_build_object('legalName',NEW.legal_name,'licenseNumber',NEW.license_number,'address',NEW.address)) THEN RAISE EXCEPTION 'Verified status requires authorized current evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER provider_verified_status BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION provider_status_guard();
--> statement-breakpoint
CREATE FUNCTION bill_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b bills; p providers; amount numeric;
BEGIN
 SELECT * INTO STRICT b FROM bills WHERE id=NEW.bill_id FOR NO KEY UPDATE;
 SELECT * INTO STRICT p FROM providers WHERE id=NEW.provider_id;
 IF p.organization_id IS DISTINCT FROM b.provider_organization_id OR NEW.customer_user_id<>b.customer_user_id OR NEW.currency<>b.currency THEN RAISE EXCEPTION 'Invoice identity mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.revision<>(SELECT COALESCE(max(revision),0)+1 FROM bill_revisions WHERE bill_id=NEW.bill_id) THEN RAISE EXCEPTION 'Invalid revision sequence' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM payment_intents WHERE bill_id=NEW.bill_id) THEN RAISE EXCEPTION 'Payment invoice is frozen; submit correction' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.items)<>'array' OR jsonb_array_length(NEW.items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Itemized invoice required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.items) x WHERE COALESCE(x->>'quantity','') !~ '^[1-9][0-9]*$' OR COALESCE(x->>'unitMinor','') !~ '^(0|[1-9][0-9]*)$' OR COALESCE(length(trim(x->>'description')),0)=0) THEN RAISE EXCEPTION 'Invalid exact invoice item' USING ERRCODE='23514'; END IF;
 SELECT sum((x->>'quantity')::numeric*(x->>'unitMinor')::numeric) INTO amount FROM jsonb_array_elements(NEW.items) x;
 IF amount<>NEW.total_minor OR amount<=0 OR amount>2147483647 THEN RAISE EXCEPTION 'Invoice total mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bill_revision_validate BEFORE INSERT ON bill_revisions FOR EACH ROW EXECUTE FUNCTION bill_revision_guard();
CREATE TRIGGER bill_revision_immutable BEFORE UPDATE OR DELETE ON bill_revisions FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER bill_confirmation_immutable BEFORE UPDATE OR DELETE ON bill_confirmations FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER bill_history_immutable BEFORE UPDATE OR DELETE ON bill_change_history FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER bill_correction_immutable BEFORE UPDATE OR DELETE ON bill_corrections FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
--> statement-breakpoint
CREATE FUNCTION bill_history_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO bill_change_history(bill_id,before,after) VALUES(OLD.id,to_jsonb(OLD),to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER bill_amendment_history AFTER UPDATE ON bills FOR EACH ROW WHEN(OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION bill_history_record();
--> statement-breakpoint
CREATE FUNCTION bill_current_revision_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r bill_revisions; b bills;
BEGIN
 SELECT * INTO b FROM bills WHERE id=NEW.id;
 SELECT * INTO r FROM bill_revisions WHERE bill_id=b.id ORDER BY revision DESC LIMIT 1;
 IF FOUND AND (b.total_amount_minor<>r.total_minor OR b.currency<>r.currency OR b.customer_user_id<>r.customer_user_id OR b.provider_name<>r.provider_name OR b.provider_organization_id IS DISTINCT FROM (SELECT organization_id FROM providers WHERE id=r.provider_id)) THEN RAISE EXCEPTION 'Bill must match the current immutable revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER bill_current_revision AFTER UPDATE ON bills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bill_current_revision_check();
--> statement-breakpoint
CREATE FUNCTION assert_provider_payable(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b bills; p providers; v provider_verification_records; r bill_revisions;
BEGIN
 SELECT * INTO STRICT b FROM bills WHERE id=target FOR SHARE;
 SELECT * INTO p FROM providers WHERE organization_id=b.provider_organization_id FOR SHARE;
 IF NOT FOUND OR p.status<>'verified' OR NOT EXISTS(SELECT 1 FROM organizations WHERE id=p.organization_id AND status='approved' FOR SHARE) THEN RAISE EXCEPTION 'Provider is not verified and active' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM provider_verification_records WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND OR v.method<>'registry_check' OR v.status<>'verified' OR v.valid_until IS NULL OR v.valid_until<=now() OR v.verified_details IS DISTINCT FROM jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address) THEN RAISE EXCEPTION 'Current authorized provider verification is required' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM bill_revisions WHERE bill_id=b.id ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND OR r.total_minor<>b.total_amount_minor OR r.currency<>b.currency THEN RAISE EXCEPTION 'An itemized current invoice is required' USING ERRCODE='23514'; END IF;
 IF r.requires_documents AND NOT EXISTS(SELECT 1 FROM bill_documents WHERE bill_id=b.id AND revision_number=r.revision) THEN RAISE EXCEPTION 'Supporting documentation required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bill_confirmations WHERE bill_id=b.id AND revision=r.revision AND kind='customer') OR NOT EXISTS(SELECT 1 FROM bill_confirmations WHERE bill_id=b.id AND revision=r.revision AND kind=r.confirmation_kind AND evidence_document_id IS NOT NULL) THEN RAISE EXCEPTION 'Customer review and evidenced provider confirmation required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM disputes WHERE bill_id=b.id AND status='open') OR EXISTS(SELECT 1 FROM bill_corrections WHERE bill_id=b.id AND status='submitted') THEN RAISE EXCEPTION 'Bill has an unresolved dispute or correction' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION live_provider_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.adapter_mode='live' AND (TG_OP='INSERT' OR NEW.status IN ('paying','paid','succeeded','ledger_captured')) THEN PERFORM assert_provider_payable(NEW.bill_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER live_provider_payment_guard BEFORE INSERT OR UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION live_provider_payment_guard();
--> statement-breakpoint
CREATE FUNCTION bill_confirmation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b bills;
BEGIN
 SELECT * INTO STRICT b FROM bills WHERE id=NEW.bill_id FOR SHARE;
 IF NEW.revision<>(SELECT max(revision) FROM bill_revisions WHERE bill_id=b.id) THEN RAISE EXCEPTION 'Confirm the current revision' USING ERRCODE='23514'; END IF;
 IF NEW.kind='customer' THEN
  IF NEW.actor_user_id<>b.customer_user_id AND NOT EXISTS(SELECT 1 FROM care_authorizations WHERE owner_user_id=b.customer_user_id AND caregiver_user_id=NEW.actor_user_id AND dependent_id IS NOT DISTINCT FROM b.dependent_id AND revoked_at IS NULL AND expires_at>now() AND scopes ? 'records:write') THEN RAISE EXCEPTION 'Customer authorization required' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.actor_user_id=b.customer_user_id OR NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=b.provider_organization_id AND user_id=NEW.actor_user_id AND status='active' AND role IN ('provider_staff','provider_manager','organization_admin')) OR NOT EXISTS(SELECT 1 FROM bill_documents WHERE id=NEW.evidence_document_id AND bill_id=b.id AND revision_number=NEW.revision) THEN RAISE EXCEPTION 'Authorized provider and matching external evidence required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bill_confirmation_validate BEFORE INSERT ON bill_confirmations FOR EACH ROW EXECUTE FUNCTION bill_confirmation_guard();
