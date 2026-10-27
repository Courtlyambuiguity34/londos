-- Keep customer/financial references intact; deleted catalogue data is recoverable
-- for 30 days and then scrubbed to non-public identity stubs by maintenance.
ALTER TABLE departments ADD COLUMN deleted_at timestamptz;
ALTER TABLE departments ADD COLUMN deletion_batch uuid;
ALTER TABLE departments ADD COLUMN purged_at timestamptz;
ALTER TABLE products ADD COLUMN deleted_at timestamptz;
ALTER TABLE products ADD COLUMN deletion_batch uuid;
ALTER TABLE products ADD COLUMN purged_at timestamptz;
ALTER TABLE departments ADD CONSTRAINT department_deleted_state CHECK (
 (deleted_at IS NULL)=(deletion_batch IS NULL) AND (deleted_at IS NULL OR archived) AND (purged_at IS NULL OR deleted_at IS NOT NULL));
ALTER TABLE products ADD CONSTRAINT product_deleted_state CHECK (
 (deleted_at IS NULL)=(deletion_batch IS NULL) AND (deleted_at IS NULL OR availability='archived') AND (purged_at IS NULL OR deleted_at IS NOT NULL));
CREATE INDEX catalogue_department_deleted ON departments(deleted_at,id) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;
CREATE INDEX catalogue_product_deleted ON products(deleted_at,id) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;
CREATE INDEX catalogue_product_department ON products(department_id,shop_id) WHERE deleted_at IS NULL;

CREATE TABLE catalogue_history (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL, merchant_id uuid NOT NULL,
 entity_kind text NOT NULL CHECK(entity_kind IN ('department','product')), entity_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('created','updated','deleted','restored','reverted','renamed')),
 actor_id text, batch_id uuid,
 before_state jsonb, after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 days',
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id),
 CHECK(before_state IS NULL OR (jsonb_typeof(before_state)='object' AND octet_length(before_state::text)<=12000)),
 CHECK(jsonb_typeof(after_state)='object' AND octet_length(after_state::text)<=12000),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days 1 minute')
);
CREATE INDEX catalogue_history_shop ON catalogue_history(shop_id,created_at DESC,id DESC);
CREATE INDEX catalogue_history_entity ON catalogue_history(shop_id,entity_kind,entity_id,created_at DESC);
CREATE INDEX catalogue_history_expiry ON catalogue_history(expires_at,id);
CREATE FUNCTION preserve_catalogue_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND OLD.expires_at<=clock_timestamp() THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Unexpired catalogue history is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER catalogue_history_immutable BEFORE UPDATE OR DELETE ON catalogue_history FOR EACH ROW EXECUTE FUNCTION preserve_catalogue_history();

CREATE FUNCTION catalogue_department_name_key(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
 RETURN lower(btrim(regexp_replace(normalize($1,NFKC), '[[:space:]]+', ' ', 'g')));
ALTER TABLE departments ADD COLUMN name_key text GENERATED ALWAYS AS (catalogue_department_name_key(name)) STORED;
-- Resolve legacy duplicates without merging records, changing URLs, moving
-- products or discarding archived departments. Existing open edits become stale.
DO $$ DECLARE item record; suffix integer; candidate text; changed record; BEGIN
 FOR item IN
  SELECT * FROM (SELECT d.*, row_number() OVER(PARTITION BY shop_id,name_key ORDER BY position,id) AS duplicate_number FROM departments d) ranked
  WHERE duplicate_number>1 ORDER BY shop_id,position,id
 LOOP
  suffix:=2;
  LOOP
   candidate:=left(item.name,120-length(' ('||suffix||')'))||' ('||suffix||')';
   EXIT WHEN NOT EXISTS(SELECT 1 FROM departments WHERE shop_id=item.shop_id AND id<>item.id AND name_key=catalogue_department_name_key(candidate));
   suffix:=suffix+1;
  END LOOP;
  UPDATE departments SET name=candidate,version=version+1 WHERE id=item.id RETURNING * INTO changed;
  INSERT INTO catalogue_history(id,shop_id,merchant_id,entity_kind,entity_id,action,before_state,after_state)
  VALUES(gen_random_uuid(),item.shop_id,item.merchant_id,'department',item.id,'renamed',
   jsonb_build_object('data',jsonb_build_object('name',item.name,'slug',item.slug,'position',item.position,'archived',item.archived,'version',item.version),'deletedAt',NULL,'deletionBatch',NULL,'purgedAt',NULL),
   jsonb_build_object('data',jsonb_build_object('name',changed.name,'slug',changed.slug,'position',changed.position,'archived',changed.archived,'version',changed.version),'deletedAt',NULL,'deletionBatch',NULL,'purgedAt',NULL));
 END LOOP;
END $$;
CREATE UNIQUE INDEX department_name_unique ON departments(shop_id,name_key) WHERE deleted_at IS NULL;
ALTER TABLE departments ADD CONSTRAINT department_name_not_blank CHECK(name_key<>'');
