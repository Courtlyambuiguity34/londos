CREATE TABLE trust_reports (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL, merchant_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('content','product','payment','privacy','other')),
 message text NOT NULL CHECK(length(message) BETWEEN 10 AND 2000),
 capability_hash text NOT NULL CHECK(length(capability_hash)=64), fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 attachment_until timestamptz NOT NULL DEFAULT (now()+interval '30 minutes'), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id), UNIQUE(id,shop_id,merchant_id)
);
CREATE TRIGGER trust_report_immutable BEFORE UPDATE OR DELETE ON trust_reports FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE trust_cases (
 id uuid PRIMARY KEY, report_id uuid NOT NULL UNIQUE, shop_id uuid NOT NULL, merchant_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','reviewing','suspended','dismissed','reinstated')),
 restriction text NOT NULL DEFAULT 'clear' CHECK(restriction IN ('clear','under_review','suspended')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2),
 public_reason text NOT NULL DEFAULT '', restricting_actor text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(report_id,shop_id,merchant_id) REFERENCES trust_reports(id,shop_id,merchant_id), UNIQUE(id,shop_id,merchant_id),
 CHECK((state IN ('open','dismissed','reinstated') AND restriction='clear') OR (state='reviewing' AND restriction='under_review') OR (state='suspended' AND restriction='suspended'))
);
CREATE INDEX trust_case_shop ON trust_cases(shop_id,created_at,id);
CREATE INDEX trust_case_queue ON trust_cases(priority DESC,created_at,id) WHERE state NOT IN ('dismissed','reinstated');
CREATE FUNCTION prevent_trust_case_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.id,NEW.report_id,NEW.shop_id,NEW.merchant_id) IS DISTINCT FROM (OLD.id,OLD.report_id,OLD.shop_id,OLD.merchant_id) THEN RAISE EXCEPTION 'Trust case identity is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trust_case_identity BEFORE UPDATE ON trust_cases FOR EACH ROW EXECUTE FUNCTION prevent_trust_case_identity_change();
CREATE TABLE operator_trust_scopes (
 user_id text NOT NULL REFERENCES "user"(id), case_id uuid NOT NULL REFERENCES trust_cases(id), PRIMARY KEY(user_id,case_id)
);
CREATE TABLE trust_evidence (
 report_id uuid PRIMARY KEY REFERENCES trust_reports(id), bytes bytea NOT NULL CHECK(octet_length(bytes)<=2097152),
 digest text NOT NULL CHECK(length(digest)=64), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trust_evidence_immutable BEFORE UPDATE OR DELETE ON trust_evidence FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE trust_events (
 id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES trust_cases(id), actor_id text NOT NULL REFERENCES "user"(id),
 kind text NOT NULL CHECK(kind IN ('note','review','suspend','dismiss','reinstate','appeal')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 2000), public_reason text NOT NULL DEFAULT '' CHECK(length(public_reason)<=500),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,case_id)
);
CREATE INDEX trust_event_history ON trust_events(case_id,created_at DESC,id DESC);
CREATE TRIGGER trust_event_immutable BEFORE UPDATE OR DELETE ON trust_events FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE trust_appeals (
 id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES trust_cases(id), resolved_at timestamptz,
 FOREIGN KEY(id,case_id) REFERENCES trust_events(id,case_id),
 resolved_by text REFERENCES "user"(id), CHECK((resolved_at IS NULL)=(resolved_by IS NULL))
);
CREATE UNIQUE INDEX trust_pending_appeal ON trust_appeals(case_id) WHERE resolved_at IS NULL;
CREATE TABLE shop_trust_control (
 shop_id uuid PRIMARY KEY, merchant_id uuid NOT NULL,
 baseline text NOT NULL CHECK(baseline IN ('clear','under_review','suspended')),
 computed text NOT NULL CHECK(computed IN ('clear','under_review','suspended')),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
CREATE FUNCTION prevent_trust_baseline_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.shop_id,NEW.merchant_id,NEW.baseline) IS DISTINCT FROM (OLD.shop_id,OLD.merchant_id,OLD.baseline) THEN RAISE EXCEPTION 'Trust baseline is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trust_baseline_identity BEFORE UPDATE ON shop_trust_control FOR EACH ROW EXECUTE FUNCTION prevent_trust_baseline_change();
CREATE TRIGGER trust_baseline_retained BEFORE DELETE ON shop_trust_control FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
