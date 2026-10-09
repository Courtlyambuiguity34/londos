-- Additive merge marker: both independently developed 019 migrations must exist.
DO $$
BEGIN
  IF to_regclass('public.notification_deliveries') IS NULL
     OR to_regclass('public.demo_accounts') IS NULL THEN
    RAISE EXCEPTION '019 release delivery contract is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='ai_design_requests'
      AND column_name='decisions'
  ) THEN
    RAISE EXCEPTION '019 shop designer intent contract is missing';
  END IF;
END
$$;
