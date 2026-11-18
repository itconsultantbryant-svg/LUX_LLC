-- Payroll-funded cover, AI validation summaries and simulated Orange Money wallets.
-- Every monetary movement recorded here is synthetic. No live Orange Money API is
-- configured in this repository, and LUX never holds customer money.

CREATE TABLE insurance_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  monthly_premium_minor bigint NOT NULL CHECK(monthly_premium_minor>=0),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  benefits jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  effective_from date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(insurer_id,code)
);

CREATE TABLE payroll_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id uuid NOT NULL REFERENCES organizations(id),
  package_id uuid NOT NULL REFERENCES insurance_packages(id),
  level text NOT NULL,
  label text NOT NULL,
  min_salary_minor bigint NOT NULL CHECK(min_salary_minor>=0),
  max_salary_minor bigint CHECK(max_salary_minor IS NULL OR max_salary_minor>=min_salary_minor),
  deduction_minor bigint NOT NULL CHECK(deduction_minor>0),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(insurer_id,level)
);

CREATE TABLE payroll_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  insurer_id uuid NOT NULL REFERENCES organizations(id),
  package_id uuid NOT NULL REFERENCES insurance_packages(id),
  band_id uuid NOT NULL REFERENCES payroll_bands(id),
  employment_level text NOT NULL,
  employer_name text NOT NULL,
  gross_salary_minor bigint NOT NULL CHECK(gross_salary_minor>=0),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','CANCELLED')),
  simulated boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_id,insurer_id)
);
CREATE INDEX payroll_insurer_members ON payroll_subscriptions(insurer_id,status,created_at DESC);

CREATE TABLE payroll_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES payroll_subscriptions(id),
  period_start date NOT NULL,
  gross_salary_minor bigint NOT NULL CHECK(gross_salary_minor>=0),
  deduction_minor bigint NOT NULL CHECK(deduction_minor>=0),
  net_salary_minor bigint NOT NULL CHECK(net_salary_minor>=0),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  status text NOT NULL DEFAULT 'DEDUCTED' CHECK(status IN ('SCHEDULED','DEDUCTED','SKIPPED','FAILED')),
  simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id,period_start),
  CHECK(net_salary_minor=gross_salary_minor-deduction_minor)
);
CREATE INDEX payroll_period ON payroll_deductions(period_start DESC,subscription_id);

ALTER TABLE validation_runs
  ADD COLUMN risk_score int CHECK(risk_score BETWEEN 0 AND 100),
  ADD COLUMN summary jsonb NOT NULL DEFAULT '{}';

CREATE TABLE organization_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL DEFAULT 'ORANGE_MONEY' CHECK(provider IN ('ORANGE_MONEY')),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK(balance_minor>=0),
  simulated boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,provider,currency)
);

-- Explicit, append-only record of simulated float supplied to an insurer wallet
-- for the demo. It is not a customer deposit and LUX holds no customer money.
CREATE TABLE wallet_fundings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL DEFAULT 'ORANGE_MONEY' CHECK(provider IN ('ORANGE_MONEY')),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  amount_minor bigint NOT NULL CHECK(amount_minor>0),
  reason text NOT NULL,
  simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_funding_time ON wallet_fundings(organization_id,created_at DESC);

CREATE TABLE wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  from_organization_id uuid NOT NULL REFERENCES organizations(id),
  to_organization_id uuid NOT NULL REFERENCES organizations(id),
  currency text NOT NULL CHECK(currency IN ('USD','LRD')),
  kind text NOT NULL CHECK(kind IN ('SETTLEMENT','REVERSAL')),
  principal_minor bigint NOT NULL CHECK(principal_minor>=0),
  fee_total_minor bigint NOT NULL CHECK(fee_total_minor>=0),
  lux_minor bigint NOT NULL CHECK(lux_minor>=0),
  orange_minor bigint NOT NULL CHECK(orange_minor>=0),
  insurer_debit_minor bigint NOT NULL CHECK(insurer_debit_minor>=0),
  facility_credit_minor bigint NOT NULL CHECK(facility_credit_minor>=0),
  simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id,kind),
  CHECK(lux_minor+orange_minor=fee_total_minor)
);
CREATE INDEX wallet_transfer_time ON wallet_transactions(created_at DESC,id);
CREATE INDEX wallet_transfer_from ON wallet_transactions(from_organization_id,created_at DESC);
CREATE INDEX wallet_transfer_to ON wallet_transactions(to_organization_id,created_at DESC);

CREATE TRIGGER wallet_tx_immutable BEFORE UPDATE OR DELETE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER wallet_funding_immutable BEFORE UPDATE OR DELETE ON wallet_fundings FOR EACH ROW EXECUTE FUNCTION immutable_record();

-- Existing organizations get an empty simulated wallet. Demo funding and payroll
-- history are added by the idempotent backfill script, never by resetting records.
INSERT INTO organization_wallets(organization_id,provider,currency,balance_minor,simulated)
SELECT id,'ORANGE_MONEY','USD',0,true FROM organizations
ON CONFLICT (organization_id,provider,currency) DO NOTHING;
