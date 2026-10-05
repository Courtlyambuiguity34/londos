-- P8 is an explicit development workflow; existing fixture tenancies are not enrolled.
CREATE TABLE rent_policies (
 id uuid PRIMARY KEY, label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 currency text NOT NULL CHECK(currency='UGX'), amount_minor minor_units NOT NULL CHECK(amount_minor>0 AND amount_minor<=1000000000),
 period_days integer NOT NULL CHECK(period_days BETWEEN 1 AND 366), grace_days integer NOT NULL CHECK(grace_days BETWEEN 0 AND 30),
 mall_capacity integer NOT NULL CHECK(mall_capacity BETWEEN 1 AND 5000), development_only boolean NOT NULL CHECK(development_only),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO rent_policies VALUES('90000000-0000-4000-8000-000000000001','Development: 30 days / 7-day grace','UGX',5000,30,7,1500,true,now());
CREATE TRIGGER rent_policy_append_only BEFORE UPDATE OR DELETE ON rent_policies FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

ALTER TABLE applications ADD COLUMN business_name text NOT NULL DEFAULT '' CHECK(length(business_name)<=120);
ALTER TABLE applications ADD COLUMN category text NOT NULL DEFAULT 'other' CHECK(category IN ('fashion','electronics','beauty','food','home','services','other'));
ALTER TABLE applications ADD COLUMN location text NOT NULL DEFAULT '' CHECK(length(location)<=160);
ALTER TABLE applications ADD COLUMN description text NOT NULL DEFAULT '' CHECK(length(description)<=2000);
ALTER TABLE applications ADD COLUMN phone text NOT NULL DEFAULT '' CHECK(phone='' OR phone ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE applications ADD COLUMN review_reason text NOT NULL DEFAULT '' CHECK(length(review_reason)<=500);
ALTER TABLE applications ADD COLUMN submitted_at timestamptz;
ALTER TABLE applications ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE applications ADD COLUMN policy_id uuid REFERENCES rent_policies(id);
ALTER TABLE applications ADD COLUMN request_key uuid;
ALTER TABLE applications ADD COLUMN request_fingerprint text;
ALTER TABLE applications ADD COLUMN provisioned_shop_id uuid;
ALTER TABLE applications ADD CONSTRAINT application_provisioned_shop FOREIGN KEY(provisioned_shop_id,merchant_id) REFERENCES shops(id,merchant_id);
CREATE UNIQUE INDEX application_request ON applications(applicant_id,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX application_owner_list ON applications(merchant_id,created_at DESC,id);
CREATE INDEX application_review_queue ON applications(state,submitted_at,id);
CREATE INDEX application_duplicate_name ON applications(lower(business_name)) WHERE state<>'rejected';
CREATE FUNCTION protect_application_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id<>OLD.id OR NEW.merchant_id<>OLD.merchant_id OR NEW.applicant_id<>OLD.applicant_id OR NEW.request_key IS DISTINCT FROM OLD.request_key OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint THEN
  RAISE EXCEPTION 'Application identity is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.policy_id IS NOT NULL AND NEW.policy_id IS DISTINCT FROM OLD.policy_id THEN RAISE EXCEPTION 'Approved policy is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.provisioned_shop_id IS NOT NULL AND NEW.provisioned_shop_id IS DISTINCT FROM OLD.provisioned_shop_id THEN RAISE EXCEPTION 'Provisioning identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER application_identity BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION protect_application_identity();
CREATE TABLE operator_application_scopes (
 user_id text NOT NULL REFERENCES "user"(id), application_id uuid NOT NULL REFERENCES applications(id),
 permission text NOT NULL CHECK(permission IN ('review','finance')), PRIMARY KEY(user_id,application_id,permission)
);
CREATE TABLE application_evidence (
 application_id uuid NOT NULL, merchant_id uuid NOT NULL, slot integer NOT NULL CHECK(slot BETWEEN 1 AND 2),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 2097152), digest text NOT NULL CHECK(length(digest)=64),
 created_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(application_id,slot), FOREIGN KEY(application_id,merchant_id) REFERENCES applications(id,merchant_id)
);
CREATE TABLE application_submissions (
 application_id uuid NOT NULL REFERENCES applications(id), version integer NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL CHECK(octet_length(snapshot::text)<=12000), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(application_id,version)
);
CREATE TRIGGER application_submission_history BEFORE UPDATE OR DELETE ON application_submissions FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

CREATE TABLE rent_invoice_state (
 invoice_id uuid PRIMARY KEY REFERENCES invoices(id), reference text NOT NULL UNIQUE CHECK(reference ~ '^LON-[A-F0-9]{32}$'),
 policy_id uuid NOT NULL REFERENCES rent_policies(id), kind text NOT NULL CHECK(kind IN ('initial','renewal')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), finalized boolean NOT NULL DEFAULT false,
 application_id uuid NOT NULL REFERENCES applications(id)
);
CREATE UNIQUE INDEX initial_invoice_application ON rent_invoice_state(application_id) WHERE kind='initial';
ALTER TABLE invoices ADD CONSTRAINT invoice_application_identity UNIQUE(id,application_id);
ALTER TABLE rent_invoice_state ADD CONSTRAINT state_invoice_application FOREIGN KEY(invoice_id,application_id) REFERENCES invoices(id,application_id);
CREATE TABLE rent_contracts (
 shop_id uuid PRIMARY KEY, merchant_id uuid NOT NULL, application_id uuid NOT NULL UNIQUE, policy_id uuid NOT NULL REFERENCES rent_policies(id),
 next_check_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id), FOREIGN KEY(application_id,merchant_id) REFERENCES applications(id,merchant_id)
);
CREATE INDEX rent_contract_due ON rent_contracts(next_check_at,shop_id);
CREATE INDEX invoices_shop_history ON invoices(shop_id,created_at DESC,id);
CREATE INDEX rent_events_invoice ON rent_events(invoice_id,created_at,id);
CREATE TABLE rent_command_receipts (
 actor_id text NOT NULL REFERENCES "user"(id), request_key uuid NOT NULL, fingerprint text NOT NULL,
 invoice_id uuid NOT NULL REFERENCES invoices(id), result jsonb NOT NULL,
 PRIMARY KEY(actor_id,request_key)
);
ALTER TABLE rent_events ADD CONSTRAINT rent_event_invoice_identity UNIQUE(id,invoice_id);
CREATE TABLE rent_reversals (
 original_event_id uuid PRIMARY KEY, reversal_event_id uuid NOT NULL UNIQUE, invoice_id uuid NOT NULL REFERENCES invoices(id),
 FOREIGN KEY(original_event_id,invoice_id) REFERENCES rent_events(id,invoice_id),
 FOREIGN KEY(reversal_event_id,invoice_id) REFERENCES rent_events(id,invoice_id)
);
CREATE TRIGGER rent_receipt_history BEFORE UPDATE OR DELETE ON rent_command_receipts FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER rent_reversal_history BEFORE UPDATE OR DELETE ON rent_reversals FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION protect_workflow_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE finalized boolean;
BEGIN
 SELECT s.finalized INTO finalized FROM rent_invoice_state s WHERE s.invoice_id=OLD.id;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Workflow invoices cannot be deleted'; END IF;
 IF NEW.id<>OLD.id OR NEW.merchant_id<>OLD.merchant_id OR NEW.application_id IS DISTINCT FROM OLD.application_id OR NEW.currency<>OLD.currency OR NEW.amount_minor<>OLD.amount_minor OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Invoice identity/amount is immutable'; END IF;
 IF OLD.shop_id IS NOT NULL AND NEW.shop_id IS DISTINCT FROM OLD.shop_id THEN RAISE EXCEPTION 'Invoice shop is immutable'; END IF;
 IF finalized AND (NEW.period_start<>OLD.period_start OR NEW.period_end<>OLD.period_end) THEN RAISE EXCEPTION 'Finalized coverage is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_invoice_immutable BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_workflow_invoice();
CREATE FUNCTION protect_invoice_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.invoice_id<>OLD.invoice_id OR NEW.application_id<>OLD.application_id OR NEW.reference<>OLD.reference OR NEW.policy_id<>OLD.policy_id OR NEW.kind<>OLD.kind OR (OLD.finalized AND NOT NEW.finalized) THEN RAISE EXCEPTION 'Invoice state identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_invoice_state BEFORE UPDATE ON rent_invoice_state FOR EACH ROW EXECUTE FUNCTION protect_invoice_state();
CREATE TRIGGER workflow_invoice_state_delete BEFORE DELETE ON rent_invoice_state FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION protect_rent_contract() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.shop_id<>OLD.shop_id OR NEW.merchant_id<>OLD.merchant_id OR NEW.application_id<>OLD.application_id OR NEW.policy_id<>OLD.policy_id THEN RAISE EXCEPTION 'Rent contract identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rent_contract_identity BEFORE UPDATE ON rent_contracts FOR EACH ROW EXECUTE FUNCTION protect_rent_contract();
CREATE TRIGGER rent_contract_delete BEFORE DELETE ON rent_contracts FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
-- Workflow ledger constraints also hold when callers bypass application validation.
CREATE FUNCTION verify_workflow_rent_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target invoices%ROWTYPE; original rent_events%ROWTYPE; credited numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM rent_invoice_state WHERE invoice_id=NEW.invoice_id) THEN RETURN NEW; END IF;
 SELECT * INTO target FROM invoices WHERE id=NEW.invoice_id;
 PERFORM id FROM merchants WHERE id=target.merchant_id FOR UPDATE;
 IF NEW.kind IN ('payment','waiver') THEN
  IF NEW.amount_minor<=0 OR NEW.source<>'local-manual' THEN RAISE EXCEPTION 'Invalid workflow credit' USING ERRCODE='23514'; END IF;
 ELSIF NEW.kind='adjustment' THEN
  SELECT * INTO original FROM rent_events WHERE id::text=NEW.source_reference AND invoice_id=NEW.invoice_id AND kind IN ('payment','waiver') AND source='local-manual';
  IF NOT FOUND OR NEW.source<>'local-reversal' OR NEW.amount_minor<>-original.amount_minor THEN RAISE EXCEPTION 'Invalid workflow reversal' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Invoice already represents the workflow charge' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(amount_minor),0) INTO credited FROM rent_events WHERE invoice_id=NEW.invoice_id;
 IF credited+NEW.amount_minor<0 OR credited+NEW.amount_minor>target.amount_minor THEN RAISE EXCEPTION 'Workflow credit exceeds invoice bounds' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_rent_event BEFORE INSERT ON rent_events FOR EACH ROW EXECUTE FUNCTION verify_workflow_rent_event();
