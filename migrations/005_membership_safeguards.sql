CREATE TABLE staff_shop_grants (merchant_id uuid NOT NULL, user_id text NOT NULL, shop_id uuid NOT NULL, permissions text[] NOT NULL CHECK(permissions <@ ARRAY['catalogue','design','publish','finance','sensitive']::text[]), PRIMARY KEY(user_id,shop_id), FOREIGN KEY(merchant_id,user_id) REFERENCES memberships(merchant_id,user_id), FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id));
CREATE FUNCTION ensure_active_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.merchant_id,OLD.merchant_id);
  PERFORM id FROM merchants WHERE id=target FOR UPDATE;
  IF EXISTS(SELECT 1 FROM merchants WHERE id=target) AND NOT EXISTS(SELECT 1 FROM memberships WHERE merchant_id=target AND role='owner' AND status='active') THEN
    RAISE EXCEPTION 'At least one active owner is required' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER membership_active_owner AFTER INSERT OR UPDATE OR DELETE ON memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_active_owner();
