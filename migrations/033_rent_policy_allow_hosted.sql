-- Migration 010 added CHECK(development_only), unintentionally forbidding
-- production policies where development_only = false.
-- Remove only that known boolean check; preserve all other constraints.
ALTER TABLE public.rent_policies
  DROP CONSTRAINT IF EXISTS rent_policies_development_only_check;

COMMENT ON COLUMN public.rent_policies.development_only IS
  'true: development-only policy; false: hosted production policy.';
