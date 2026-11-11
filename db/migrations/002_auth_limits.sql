CREATE TABLE "rateLimit" (id text PRIMARY KEY, key text UNIQUE NOT NULL, count int NOT NULL, "lastRequest" bigint NOT NULL);
