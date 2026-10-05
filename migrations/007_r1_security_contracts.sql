-- R1: bind authentication to the current credential/factor generation. Existing
-- MFA proofs are transient and cannot be safely attributed retroactively.
ALTER TABLE "user" ADD COLUMN auth_epoch uuid NOT NULL DEFAULT gen_random_uuid();
DELETE FROM mfa_proofs;
ALTER TABLE "twoFactor" ADD CONSTRAINT factor_actor_identity UNIQUE(id,"userId");
ALTER TABLE mfa_proofs ADD COLUMN factor_id text NOT NULL;
ALTER TABLE mfa_proofs ADD COLUMN auth_epoch uuid NOT NULL;
ALTER TABLE mfa_proofs ADD CONSTRAINT proof_factor_actor FOREIGN KEY(factor_id,user_id) REFERENCES "twoFactor"(id,"userId") ON DELETE CASCADE;

CREATE FUNCTION invalidate_authentication(target text, revoke_sessions boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "user" SET auth_epoch=gen_random_uuid() WHERE id=target;
  DELETE FROM mfa_proofs WHERE user_id=target;
  DELETE FROM verification WHERE
    (value=target AND (identifier LIKE '2fa-%' OR identifier LIKE 'trust-device-%'))
    OR identifier IN (SELECT '2fa-attempts-' || identifier FROM verification WHERE value=target AND identifier LIKE '2fa-%');
  IF revoke_sessions THEN DELETE FROM session WHERE "userId"=target; END IF;
END $$;

CREATE FUNCTION invalidate_password_authentication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM invalidate_authentication(NEW."userId",true);
  RETURN NEW;
END $$;
CREATE TRIGGER password_authentication AFTER UPDATE OF password ON account FOR EACH ROW
  WHEN (NEW."providerId"='credential' AND OLD.password IS DISTINCT FROM NEW.password)
  EXECUTE FUNCTION invalidate_password_authentication();

CREATE FUNCTION guard_factor_authentication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM invalidate_authentication(OLD."userId",true);
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    PERFORM invalidate_authentication(NEW."userId",false);
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW."userId"<>OLD."userId" THEN
    RAISE EXCEPTION 'Factor identity is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.verified IS TRUE AND (NEW.secret<>OLD.secret OR NEW.verified IS NOT TRUE) THEN
    RAISE EXCEPTION 'An enrolled factor must be explicitly removed before replacement' USING ERRCODE='23514';
  END IF;
  IF NEW.secret<>OLD.secret THEN PERFORM invalidate_authentication(NEW."userId",false); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER factor_authentication BEFORE INSERT OR UPDATE OR DELETE ON "twoFactor" FOR EACH ROW EXECUTE FUNCTION guard_factor_authentication();

-- An owner who loses membership authority cannot leave an unaccepted grant
-- behind. This also covers ownership transfer and rolls back with its transaction.
CREATE FUNCTION revoke_departing_owner_invitations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role='owner' AND OLD.status='active' THEN
    IF TG_OP='DELETE' OR NEW.role<>'owner' OR NEW.status<>'active' THEN
      UPDATE invitations SET revoked_at=clock_timestamp()
      WHERE merchant_id=OLD.merchant_id AND invited_by=OLD.user_id
        AND accepted_at IS NULL AND revoked_at IS NULL;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER departing_owner_invitations AFTER UPDATE OF role,status OR DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION revoke_departing_owner_invitations();

-- numeric(p,0) rounds its input before a CHECK sees it. An unscaled domain
-- preserves the supplied value, then rejects fractions and out-of-range values.
CREATE DOMAIN minor_units AS numeric CHECK (
  VALUE=trunc(VALUE) AND VALUE BETWEEN -99999999999999999999 AND 99999999999999999999
);
ALTER TABLE products ALTER COLUMN price_minor TYPE minor_units USING price_minor::minor_units;
ALTER TABLE invoices ALTER COLUMN amount_minor TYPE minor_units USING amount_minor::minor_units;
ALTER TABLE rent_events ALTER COLUMN amount_minor TYPE minor_units USING amount_minor::minor_units;
