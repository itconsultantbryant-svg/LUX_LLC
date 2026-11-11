ALTER TABLE "twoFactor" ADD COLUMN "failedVerificationCount" integer NOT NULL DEFAULT 0;
ALTER TABLE "twoFactor" ADD COLUMN "lockedUntil" timestamptz;
