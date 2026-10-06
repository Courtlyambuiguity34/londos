-- Additive generation counters: no rewrite or backfill of existing business data.
-- Statement transition tables advance once per affected shop even for bulk writes.
CREATE TABLE shop_catalogue_versions (
  shop_id uuid PRIMARY KEY REFERENCES shops(id),
  generation bigint NOT NULL CHECK(generation>0)
);
CREATE FUNCTION advance_catalogue_new() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shop_catalogue_versions(shop_id,generation)
    SELECT DISTINCT shop_id,1 FROM changed_new ORDER BY shop_id
    ON CONFLICT(shop_id) DO UPDATE SET generation=shop_catalogue_versions.generation+1;
  RETURN NULL;
END $$;
CREATE FUNCTION advance_catalogue_old() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shop_catalogue_versions(shop_id,generation)
    SELECT DISTINCT shop_id,1 FROM changed_old ORDER BY shop_id
    ON CONFLICT(shop_id) DO UPDATE SET generation=shop_catalogue_versions.generation+1;
  RETURN NULL;
END $$;
CREATE FUNCTION advance_catalogue_both() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shop_catalogue_versions(shop_id,generation)
    SELECT shop_id,1 FROM (SELECT shop_id FROM changed_old UNION SELECT shop_id FROM changed_new) changes ORDER BY shop_id
    ON CONFLICT(shop_id) DO UPDATE SET generation=shop_catalogue_versions.generation+1;
  RETURN NULL;
END $$;
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['products','departments','product_media','media_assets'] LOOP
    EXECUTE format('CREATE TRIGGER catalogue_insert AFTER INSERT ON %I REFERENCING NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION advance_catalogue_new()',relation);
    EXECUTE format('CREATE TRIGGER catalogue_delete AFTER DELETE ON %I REFERENCING OLD TABLE AS changed_old FOR EACH STATEMENT EXECUTE FUNCTION advance_catalogue_old()',relation);
    EXECUTE format('CREATE TRIGGER catalogue_update AFTER UPDATE ON %I REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION advance_catalogue_both()',relation);
  END LOOP;
END $$;
CREATE FUNCTION preserve_catalogue_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Catalogue generation cannot be removed' USING ERRCODE='23514'; END IF;
  IF NEW.shop_id<>OLD.shop_id OR NEW.generation<>OLD.generation+1 THEN
    RAISE EXCEPTION 'Catalogue generation must advance monotonically' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalogue_generation BEFORE UPDATE OR DELETE ON shop_catalogue_versions FOR EACH ROW EXECUTE FUNCTION preserve_catalogue_generation();
