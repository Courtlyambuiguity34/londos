ALTER TABLE operator_grants DROP CONSTRAINT operator_grants_permission_check;
ALTER TABLE operator_grants ADD CONSTRAINT operator_grants_permission_check CHECK(permission IN ('support','review','finance','moderation','recovery','jobs','operations','analytics','privacy','costs'));
CREATE TABLE shop_cost_state (
 shop_id uuid PRIMARY KEY, merchant_id uuid NOT NULL, version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
CREATE TABLE operator_cost_scopes (
 user_id text NOT NULL REFERENCES "user"(id), shop_id uuid NOT NULL, merchant_id uuid NOT NULL,
 PRIMARY KEY(user_id,shop_id), FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
CREATE TABLE resource_cost_entries (
 id uuid PRIMARY KEY, merchant_id uuid NOT NULL, shop_id uuid NOT NULL,
 actor_id text NOT NULL REFERENCES "user"(id), request_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 category text NOT NULL CHECK(category IN ('support','verification','rent_collection')), work_day date NOT NULL,
 minutes integer NOT NULL CHECK(minutes BETWEEN -480 AND 480), currency text NOT NULL CHECK(currency='UGX'),
 expense_minor bigint NOT NULL CHECK(expense_minor BETWEEN -1000000000 AND 1000000000),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500), reverses_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id), UNIQUE(id,merchant_id,shop_id), UNIQUE(actor_id,request_key),
 FOREIGN KEY(reverses_id,merchant_id,shop_id) REFERENCES resource_cost_entries(id,merchant_id,shop_id),
 CHECK((reverses_id IS NULL AND minutes>=0 AND expense_minor>=0 AND (minutes>0 OR expense_minor>0)) OR
 (reverses_id IS NOT NULL AND minutes<=0 AND expense_minor<=0 AND (minutes<0 OR expense_minor<0)))
);
CREATE UNIQUE INDEX cost_one_reversal ON resource_cost_entries(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX cost_shop_journal ON resource_cost_entries(shop_id,id);
CREATE INDEX cost_work_day ON resource_cost_entries(work_day,shop_id,category);
CREATE INDEX jobs_cost_shop_snapshot ON jobs(shop_id,state) INCLUDE(merchant_id,attempts);
CREATE INDEX jobs_cost_scope_snapshot ON jobs(merchant_id,state) WHERE shop_id IS NULL;
CREATE TRIGGER cost_entry_immutable BEFORE UPDATE OR DELETE ON resource_cost_entries FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION check_cost_entry() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE original resource_cost_entries; BEGIN
 IF NEW.reverses_id IS NULL THEN
  IF NEW.work_day>(clock_timestamp() AT TIME ZONE 'UTC')::date OR NEW.work_day<(clock_timestamp() AT TIME ZONE 'UTC')::date-89 THEN RAISE EXCEPTION 'Reported work day is outside the development window' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO original FROM resource_cost_entries WHERE id=NEW.reverses_id AND merchant_id=NEW.merchant_id AND shop_id=NEW.shop_id;
  IF NOT FOUND OR original.reverses_id IS NOT NULL OR NEW.category<>original.category OR NEW.work_day<>original.work_day OR NEW.minutes<>-original.minutes OR NEW.expense_minor<>-original.expense_minor OR NEW.currency<>original.currency THEN RAISE EXCEPTION 'Cost correction must exactly reverse its original' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cost_entry_checked BEFORE INSERT ON resource_cost_entries FOR EACH ROW EXECUTE FUNCTION check_cost_entry();
