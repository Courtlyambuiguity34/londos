ALTER TABLE operator_grants DROP CONSTRAINT operator_grants_permission_check;
ALTER TABLE operator_grants ADD CONSTRAINT operator_grants_permission_check CHECK(permission IN ('support','review','finance','moderation','recovery','jobs','operations'));
CREATE TABLE shop_addresses (
 slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=80),
 shop_id uuid NOT NULL, merchant_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
INSERT INTO shop_addresses(slug,shop_id,merchant_id) SELECT slug,id,merchant_id FROM shops;
CREATE INDEX shop_address_history ON shop_addresses(shop_id,created_at);
CREATE TRIGGER shop_address_history_immutable BEFORE UPDATE OR DELETE ON shop_addresses FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION register_shop_address() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO shop_addresses(slug,shop_id,merchant_id) VALUES(NEW.slug,NEW.id,NEW.merchant_id) ON CONFLICT(slug) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM shop_addresses WHERE slug=NEW.slug AND shop_id=NEW.id AND merchant_id=NEW.merchant_id) THEN
  RAISE EXCEPTION 'Shop address is already reserved' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shop_address_registration AFTER INSERT OR UPDATE OF slug ON shops FOR EACH ROW EXECUTE FUNCTION register_shop_address();
CREATE TABLE shop_operations (
 shop_id uuid PRIMARY KEY, merchant_id uuid NOT NULL, paused boolean NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500), changed_by text NOT NULL REFERENCES "user"(id),
 changed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
CREATE TABLE operator_operations_scopes (
 user_id text NOT NULL REFERENCES "user"(id), shop_id uuid NOT NULL REFERENCES shops(id),
 PRIMARY KEY(user_id,shop_id)
);
