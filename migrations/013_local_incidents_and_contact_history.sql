CREATE TABLE shop_contact_history (
 shop_id uuid NOT NULL, merchant_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 phone text NOT NULL, whatsapp text NOT NULL, website text NOT NULL, fulfilment text NOT NULL,
 payment_instructions text NOT NULL, delivery_instructions text NOT NULL, enquiries_enabled boolean NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(shop_id,version), UNIQUE(shop_id,merchant_id,version),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
INSERT INTO shop_contact_history(shop_id,merchant_id,version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled)
 SELECT shop_id,merchant_id,version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled FROM shop_contacts;
CREATE TRIGGER contact_history_immutable BEFORE UPDATE OR DELETE ON shop_contact_history FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION capture_contact_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO shop_contact_history(shop_id,merchant_id,version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled)
 VALUES(NEW.shop_id,NEW.merchant_id,NEW.version,NEW.phone,NEW.whatsapp,NEW.website,NEW.fulfilment,NEW.payment_instructions,NEW.delivery_instructions,NEW.enquiries_enabled);
 RETURN NEW;
END $$;
CREATE TRIGGER contact_history_capture AFTER INSERT OR UPDATE ON shop_contacts FOR EACH ROW EXECUTE FUNCTION capture_contact_history();
CREATE TABLE incident_cases (
 id uuid PRIMARY KEY, shop_id uuid NOT NULL, merchant_id uuid NOT NULL, reporter_id text NOT NULL REFERENCES "user"(id),
 kind text NOT NULL CHECK(kind IN ('security','account_recovery','contact_change','fraud','payment_exception','verification','support')),
 message text NOT NULL CHECK(length(message) BETWEEN 10 AND 2000), fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 requested_contact_revision integer, state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','investigating','escalated','resolved','cancelled')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2),
 assigned_user text REFERENCES "user"(id), public_reason text NOT NULL DEFAULT '' CHECK(length(public_reason)<=500),
 approved_contact_version integer, approved_epoch uuid, approval_until timestamptz, contained_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id),
 FOREIGN KEY(shop_id,merchant_id,requested_contact_revision) REFERENCES shop_contact_history(shop_id,merchant_id,version),
 CHECK((kind='contact_change')=(requested_contact_revision IS NOT NULL)),
 CHECK((approved_contact_version IS NULL AND approved_epoch IS NULL AND approval_until IS NULL) OR (kind='contact_change' AND approved_contact_version>0 AND approved_epoch IS NOT NULL AND approval_until IS NOT NULL))
);
CREATE INDEX incident_queue ON incident_cases(kind,priority DESC,created_at,id) WHERE state NOT IN ('resolved','cancelled');
CREATE INDEX incident_shop ON incident_cases(shop_id,created_at DESC,id DESC);
CREATE FUNCTION prevent_incident_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.id,NEW.shop_id,NEW.merchant_id,NEW.reporter_id,NEW.kind,NEW.message,NEW.fingerprint,NEW.requested_contact_revision,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.shop_id,OLD.merchant_id,OLD.reporter_id,OLD.kind,OLD.message,OLD.fingerprint,OLD.requested_contact_revision,OLD.created_at)
 THEN RAISE EXCEPTION 'Incident request identity and content are immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER incident_identity BEFORE UPDATE ON incident_cases FOR EACH ROW EXECUTE FUNCTION prevent_incident_identity_change();
CREATE TABLE operator_incident_scopes (
 user_id text NOT NULL REFERENCES "user"(id), case_id uuid NOT NULL REFERENCES incident_cases(id), PRIMARY KEY(user_id,case_id)
);
CREATE TABLE incident_events (
 id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES incident_cases(id), actor_id text NOT NULL REFERENCES "user"(id),
 kind text NOT NULL CHECK(kind IN ('created','claimed','note','escalate','resolve','contain_sessions','restore_contacts','confirm_restore','cancel')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 2000), public_reason text NOT NULL DEFAULT '' CHECK(length(public_reason)<=500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_history ON incident_events(case_id,created_at DESC,id DESC);
CREATE TRIGGER incident_event_immutable BEFORE UPDATE OR DELETE ON incident_events FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
