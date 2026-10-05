-- Additive P6/P7 contracts; existing canonical rows and immutable revisions survive.
ALTER TABLE shops ADD COLUMN category text NOT NULL DEFAULT 'other' CHECK(category IN ('fashion','electronics','beauty','food','home','services','other'));
ALTER TABLE shops ADD COLUMN tagline text NOT NULL DEFAULT '' CHECK(length(tagline)<=160);
ALTER TABLE shop_revisions ADD COLUMN author_id text REFERENCES "user"(id);
ALTER TABLE shop_revisions ADD COLUMN summary text NOT NULL DEFAULT 'Legacy revision' CHECK(length(summary) BETWEEN 1 AND 500);
ALTER TABLE shop_revisions ADD COLUMN parent_id uuid;
ALTER TABLE shop_revisions ADD CONSTRAINT revision_parent_scope FOREIGN KEY(parent_id,shop_id,merchant_id) REFERENCES shop_revisions(id,shop_id,merchant_id);
ALTER TABLE shop_revisions ADD CONSTRAINT revision_size CHECK(octet_length(design::text)<=8192) NOT VALID;
CREATE TABLE shop_designs (
  shop_id uuid PRIMARY KEY,
  merchant_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK(version>=0),
  last_revision integer NOT NULL DEFAULT 0 CHECK(last_revision>=0),
  draft_id uuid,
  published_id uuid,
  FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id),
  FOREIGN KEY(draft_id,shop_id,merchant_id) REFERENCES shop_revisions(id,shop_id,merchant_id),
  FOREIGN KEY(published_id,shop_id,merchant_id) REFERENCES shop_revisions(id,shop_id,merchant_id)
);
CREATE FUNCTION preserve_design_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.shop_id<>OLD.shop_id OR NEW.merchant_id<>OLD.merchant_id THEN RAISE EXCEPTION 'Design identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER design_identity BEFORE UPDATE ON shop_designs FOR EACH ROW EXECUTE FUNCTION preserve_design_scope();
CREATE INDEX departments_public_order ON departments(shop_id,position,id) WHERE archived=false;
CREATE INDEX products_public_order ON products(shop_id,department_id,position,id) WHERE availability<>'archived';
ALTER TABLE shops ADD COLUMN search_document tsvector GENERATED ALWAYS AS (to_tsvector('english',name || ' ' || tagline)) STORED;
ALTER TABLE departments ADD COLUMN search_document tsvector GENERATED ALWAYS AS (to_tsvector('english',name)) STORED;
ALTER TABLE products ADD COLUMN search_document tsvector GENERATED ALWAYS AS (to_tsvector('english',name || ' ' || description)) STORED;
CREATE INDEX shops_search_gin ON shops USING gin(search_document);
CREATE INDEX departments_search_gin ON departments USING gin(search_document) WHERE archived=false;
CREATE INDEX products_search_gin ON products USING gin(search_document) WHERE availability<>'archived';
CREATE INDEX shops_category ON shops(category,id);
