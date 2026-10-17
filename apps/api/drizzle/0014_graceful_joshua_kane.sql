CREATE TABLE "customer_locations" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"accuracy_meters" integer,
	"label" varchar(120),
	"source" varchar(30) DEFAULT 'browser' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_location_latitude_valid" CHECK ("customer_locations"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "customer_location_longitude_valid" CHECK ("customer_locations"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "emergency_ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "services" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_locations" ADD CONSTRAINT "customer_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;