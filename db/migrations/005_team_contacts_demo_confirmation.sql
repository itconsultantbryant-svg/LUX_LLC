ALTER TABLE team_members ADD COLUMN contacts jsonb NOT NULL DEFAULT '[]';
CREATE TABLE demo_payment_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES payments(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id text NOT NULL REFERENCES "user"(id),
 payment_version int NOT NULL,
 code_hmac text NOT NULL,
 attempts int NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demo_challenge_rate ON demo_payment_challenges(actor_id,payment_id,created_at DESC);
