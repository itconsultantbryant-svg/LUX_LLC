CREATE TABLE claim_drafts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES "user"(id), payload jsonb NOT NULL, version int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,actor_id));
CREATE INDEX draft_owner ON claim_drafts(organization_id,actor_id);
