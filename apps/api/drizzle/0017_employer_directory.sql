ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organization_kind_valid";
ALTER TABLE "organizations" ADD CONSTRAINT "organization_kind_valid" CHECK ("kind" IN ('provider','sponsor','partner','employer'));
ALTER TABLE "organization_memberships" DROP CONSTRAINT IF EXISTS "membership_role_valid";
ALTER TABLE "organization_memberships" ADD CONSTRAINT "membership_role_valid" CHECK ("role" IN ('provider_staff','provider_manager','organization_admin','program_manager','reviewer','finance_operator','partner_officer','employer_admin'));

CREATE TABLE "employer_employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "employee_reference" varchar(100) NOT NULL,
  "department" varchar(120),
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "employer_employee_status_valid" CHECK ("status" IN ('active','inactive','invited'))
);
CREATE UNIQUE INDEX "employer_employee_org_user_unique" ON "employer_employees" ("organization_id","user_id");
CREATE UNIQUE INDEX "employer_employee_org_reference_unique" ON "employer_employees" ("organization_id","employee_reference");
CREATE INDEX "employer_employee_org_status_idx" ON "employer_employees" ("organization_id","status");
