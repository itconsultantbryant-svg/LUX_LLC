CREATE TABLE "account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by" uuid,
	CONSTRAINT "account_deletion_status_valid" CHECK ("account_deletion_requests"."status" IN ('pending','processing','completed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "system_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"reason" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_documents" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_flags" ADD CONSTRAINT "system_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Audit trail is append-only: no actor, application bug, or operator can rewrite history.
CREATE OR REPLACE FUNCTION prevent_audit_events_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_change();--> statement-breakpoint
-- A customer may only have one open account-deletion request at a time.
CREATE UNIQUE INDEX account_deletion_request_pending_unique
ON account_deletion_requests(user_id) WHERE status IN ('pending','processing');--> statement-breakpoint
-- Retention/purge scans indexes.
CREATE INDEX bill_documents_purge_idx ON bill_documents(created_at) WHERE purged_at IS NULL;--> statement-breakpoint
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);--> statement-breakpoint
CREATE INDEX otp_challenges_expiry_idx ON otp_challenges(expires_at);
