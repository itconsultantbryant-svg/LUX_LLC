CREATE TABLE "bill_funding_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"bill_amount_minor" bigint NOT NULL,
	"eligible_savings_minor" bigint DEFAULT 0 NOT NULL,
	"eligible_contributions_minor" bigint DEFAULT 0 NOT NULL,
	"eligible_vouchers_minor" bigint DEFAULT 0 NOT NULL,
	"other_eligible_minor" bigint DEFAULT 0 NOT NULL,
	"eligible_insurance_minor" bigint DEFAULT 0 NOT NULL,
	"total_eligible_minor" bigint NOT NULL,
	"allocated_minor" bigint DEFAULT 0 NOT NULL,
	"shortfall_minor" bigint NOT NULL,
	"insurance" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"plan_version" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_amounts_nonnegative" CHECK ("bill_funding_plans"."bill_amount_minor">=0 AND "bill_funding_plans"."eligible_savings_minor">=0 AND "bill_funding_plans"."eligible_contributions_minor">=0 AND "bill_funding_plans"."eligible_vouchers_minor">=0 AND "bill_funding_plans"."other_eligible_minor">=0 AND "bill_funding_plans"."eligible_insurance_minor">=0 AND "bill_funding_plans"."total_eligible_minor">=0 AND "bill_funding_plans"."allocated_minor">=0 AND "bill_funding_plans"."shortfall_minor">=0)
);
--> statement-breakpoint
CREATE TABLE "financing_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"credit_record_id" uuid NOT NULL,
	"partner_organization_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financing_inquiry_status_valid" CHECK ("financing_inquiries"."status" IN ('requested','offered','accepted','declined','withdrawn')),
	CONSTRAINT "financing_inquiry_amount_positive" CHECK ("financing_inquiries"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint,
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"reviewer_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_request_kind_valid" CHECK ("support_requests"."kind" IN ('shortfall_support','help')),
	CONSTRAINT "support_request_status_valid" CHECK ("support_requests"."status" IN ('open','acknowledged','resolved','withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "bill_funding_plans" ADD CONSTRAINT "bill_funding_plans_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_funding_plans" ADD CONSTRAINT "bill_funding_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_inquiries" ADD CONSTRAINT "financing_inquiries_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_inquiries" ADD CONSTRAINT "financing_inquiries_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_inquiries" ADD CONSTRAINT "financing_inquiries_credit_record_id_credit_records_id_fk" FOREIGN KEY ("credit_record_id") REFERENCES "public"."credit_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_inquiries" ADD CONSTRAINT "financing_inquiries_partner_organization_id_organizations_id_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_funding_plan_bill_idx" ON "bill_funding_plans" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "support_request_bill_idx" ON "support_requests" USING btree ("bill_id");