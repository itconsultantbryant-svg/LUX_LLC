-- Some long-lived development databases recorded the historical hardening
-- migration without its feature-switch table. Repair only the missing object;
-- production databases that already have it are unaffected.
DO $$
BEGIN
  IF to_regclass('public.system_flags') IS NULL THEN
    CREATE TABLE public.system_flags (
      key text PRIMARY KEY NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      reason text,
      updated_by uuid REFERENCES public.users(id),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
