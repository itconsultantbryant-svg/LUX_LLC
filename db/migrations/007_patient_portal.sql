-- Patient portal access is derived from an insurer's patient record.
-- A patient account never becomes an organization membership and cannot
-- inherit facility or insurer permissions.
ALTER TABLE insurer_patient_references ADD COLUMN contact_email text;
ALTER TABLE invitations ADD COLUMN patient_id uuid REFERENCES patients(id);
ALTER TABLE invitations ADD COLUMN patient_insurer_reference_id uuid REFERENCES insurer_patient_references(id);

CREATE UNIQUE INDEX invitation_patient_pending
  ON invitations(patient_id, patient_insurer_reference_id)
  WHERE patient_id IS NOT NULL AND accepted_at IS NULL;

CREATE TABLE patient_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  insurer_id uuid NOT NULL REFERENCES organizations(id),
  reference_id uuid NOT NULL REFERENCES insurer_patient_references(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, patient_id),
  UNIQUE(patient_id, insurer_id),
  UNIQUE(reference_id)
);
CREATE INDEX patient_account_access ON patient_accounts(user_id, status);

-- Structured calendar-month and calendar-year limits are insurer-controlled.
-- Usage is never stored here; it is derived from approved claim records.
CREATE TABLE patient_coverage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id uuid NOT NULL REFERENCES insurer_patient_references(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  insurer_id uuid NOT NULL REFERENCES organizations(id),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  monthly_limit_minor bigint NOT NULL CHECK(monthly_limit_minor >= 0),
  annual_limit_minor bigint NOT NULL CHECK(annual_limit_minor >= 0),
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  version int NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(effective_to >= effective_from),
  CHECK(annual_limit_minor >= monthly_limit_minor),
  UNIQUE(reference_id, version)
);
CREATE INDEX patient_coverage_current
  ON patient_coverage_limits(reference_id, effective_from DESC, version DESC);
