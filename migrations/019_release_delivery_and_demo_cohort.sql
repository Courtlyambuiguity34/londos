-- Expand-only: old notification jobs and application releases remain compatible.
CREATE TABLE notification_deliveries (
 job_id uuid PRIMARY KEY REFERENCES jobs(id),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 provider text NOT NULL CHECK(provider='brevo'),
 state text NOT NULL CHECK(state IN ('attempting','accepted','uncertain','rejected')),
 provider_reference text CHECK(length(provider_reference) BETWEEN 1 AND 256),
 attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((state='accepted')=(provider_reference IS NOT NULL))
);
CREATE INDEX notification_delivery_attention ON notification_deliveries(state,attempted_at) WHERE state IN ('attempting','uncertain','rejected');
CREATE FUNCTION protect_notification_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.job_id<>OLD.job_id OR NEW.fingerprint<>OLD.fingerprint OR NEW.provider<>OLD.provider OR NEW.attempted_at<>OLD.attempted_at OR OLD.state<>'attempting' THEN
  RAISE EXCEPTION 'Delivery attempt identity/final outcome is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_delivery_identity BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION protect_notification_delivery();
CREATE TRIGGER notification_delivery_history BEFORE DELETE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

ALTER TABLE "user" ADD COLUMN demo_retired boolean NOT NULL DEFAULT false;
CREATE TABLE demo_accounts (
 user_id text PRIMARY KEY REFERENCES "user"(id),
 cohort_id uuid NOT NULL,
 merchant_id uuid NOT NULL UNIQUE REFERENCES merchants(id),
 shop_id uuid NOT NULL UNIQUE,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz,
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
CREATE INDEX demo_account_cohort ON demo_accounts(cohort_id,user_id);
CREATE FUNCTION protect_demo_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.user_id<>OLD.user_id OR NEW.cohort_id<>OLD.cohort_id OR NEW.merchant_id<>OLD.merchant_id OR NEW.shop_id<>OLD.shop_id OR NEW.label<>OLD.label OR NEW.created_at<>OLD.created_at OR OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Demo registration is permanent; retirement is one way' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER demo_account_identity BEFORE UPDATE ON demo_accounts FOR EACH ROW EXECUTE FUNCTION protect_demo_identity();
CREATE TRIGGER demo_account_history BEFORE DELETE ON demo_accounts FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
