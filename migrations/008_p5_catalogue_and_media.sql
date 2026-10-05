-- P5 commands retain tenant identity and use explicit conflict versions.
ALTER TABLE departments ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE departments ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE departments ADD CONSTRAINT department_slug CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=80);
ALTER TABLE products ADD COLUMN description text NOT NULL DEFAULT '' CHECK(length(description)<=2000);
ALTER TABLE products ADD COLUMN position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1000000);
ALTER TABLE products ADD CONSTRAINT product_slug CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=80);
CREATE INDEX catalogue_department_order ON departments(shop_id,archived,position,id);
CREATE INDEX catalogue_product_order ON products(shop_id,position,id);

CREATE TABLE shop_contacts (
  shop_id uuid PRIMARY KEY, merchant_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
  phone text NOT NULL DEFAULT '' CHECK(phone='' OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text NOT NULL DEFAULT '' CHECK(whatsapp='' OR whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  website text NOT NULL DEFAULT '' CHECK(length(website)<=500),
  fulfilment text NOT NULL CHECK(fulfilment IN ('contact','pickup','delivery','pickup_and_delivery')),
  payment_instructions text NOT NULL CHECK(length(payment_instructions)<=500),
  delivery_instructions text NOT NULL CHECK(length(delivery_instructions)<=500),
  enquiries_enabled boolean NOT NULL DEFAULT false,
  FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
CREATE TABLE guest_requests (
  id uuid PRIMARY KEY, shop_id uuid NOT NULL, merchant_id uuid NOT NULL, product_id uuid,
  request_key uuid NOT NULL, fingerprint text NOT NULL, kind text NOT NULL CHECK(kind IN ('enquiry','request','reservation')),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80), reply_to text NOT NULL CHECK(length(reply_to) BETWEEN 3 AND 254),
  message text NOT NULL CHECK(length(message) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','acknowledged','closed')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id),
  FOREIGN KEY(product_id,shop_id,merchant_id) REFERENCES products(id,shop_id,merchant_id),
  UNIQUE(shop_id,request_key)
);
CREATE INDEX guest_requests_shop ON guest_requests(shop_id,created_at DESC,id);

-- Bounded private PostgreSQL blobs are the explicit development storage adapter.
-- There is no public bucket or original-file download path.
ALTER TABLE media_assets DROP CONSTRAINT media_assets_state_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_state_check CHECK(state IN ('uploaded','validating','processing','ready','rejected','failed','deleted'));
ALTER TABLE media_assets ADD COLUMN created_by text REFERENCES "user"(id);
ALTER TABLE media_assets ADD COLUMN expires_at timestamptz;
ALTER TABLE media_assets ADD COLUMN content_type text CHECK(content_type IN ('image/jpeg','image/png','image/webp'));
ALTER TABLE media_assets ADD COLUMN declared_bytes integer CHECK(declared_bytes BETWEEN 1 AND 4194304);
ALTER TABLE media_assets ADD COLUMN alt text NOT NULL DEFAULT '' CHECK(length(alt)<=240);
ALTER TABLE media_assets ADD COLUMN width integer;
ALTER TABLE media_assets ADD COLUMN height integer;
ALTER TABLE media_assets ADD COLUMN error_code text;
ALTER TABLE media_assets ADD COLUMN byte_count bigint NOT NULL DEFAULT 0 CHECK(byte_count>=0);
ALTER TABLE media_assets ADD COLUMN reserved_bytes bigint NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0);
CREATE TABLE media_quotas (
  shop_id uuid PRIMARY KEY REFERENCES shops(id), asset_count integer NOT NULL DEFAULT 0 CHECK(asset_count BETWEEN 0 AND 100),
  stored_bytes bigint NOT NULL DEFAULT 0 CHECK(stored_bytes>=0), reserved_bytes bigint NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0),
  CHECK(stored_bytes+reserved_bytes<=134217728)
);
CREATE TABLE media_blobs (
  asset_id uuid NOT NULL REFERENCES media_assets(id),
  variant text NOT NULL CHECK(variant IN ('quarantine','thumbnail','card','display','source')),
  bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 20971520),
  width integer, height integer, PRIMARY KEY(asset_id,variant)
);
CREATE TABLE product_media (
  product_id uuid PRIMARY KEY, asset_id uuid NOT NULL, shop_id uuid NOT NULL, merchant_id uuid NOT NULL,
  FOREIGN KEY(product_id,shop_id,merchant_id) REFERENCES products(id,shop_id,merchant_id),
  FOREIGN KEY(asset_id,shop_id,merchant_id) REFERENCES media_assets(id,shop_id,merchant_id)
);
CREATE INDEX product_media_asset ON product_media(asset_id);
CREATE FUNCTION preserve_catalogue_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.shop_id<>OLD.shop_id OR NEW.merchant_id<>OLD.merchant_id THEN
    RAISE EXCEPTION 'Catalogue identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER department_identity BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION preserve_catalogue_identity();
CREATE TRIGGER product_identity BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION preserve_catalogue_identity();
CREATE TRIGGER media_identity BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION preserve_catalogue_identity();
