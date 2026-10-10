-- Additive communications/manual-billing contracts. PostgreSQL remains authoritative.
CREATE TABLE email_quota_windows (
 kind text NOT NULL CHECK(kind IN ('hour','day')),
 bucket_start timestamptz NOT NULL,
 attempts integer NOT NULL CHECK(attempts>0),
 PRIMARY KEY(kind,bucket_start)
);

CREATE TABLE payment_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 support_email text NOT NULL CHECK(support_email=lower(support_email) AND length(support_email) BETWEEN 3 AND 254),
 support_phone text CHECK(support_phone ~ '^\+[1-9][0-9]{7,14}$'),
 mobile_money_phone text CHECK(mobile_money_phone ~ '^\+[1-9][0-9]{7,14}$'),
 mobile_money_name text CHECK(length(mobile_money_name) BETWEEN 2 AND 120),
 bank_name text CHECK(length(bank_name) BETWEEN 2 AND 120),
 bank_account_name text CHECK(length(bank_account_name) BETWEEN 2 AND 120),
 bank_account_number text CHECK(length(bank_account_number) BETWEEN 4 AND 80),
 updated_by text NOT NULL REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((mobile_money_phone IS NULL)=(mobile_money_name IS NULL)),
 CHECK((bank_name IS NULL)=(bank_account_name IS NULL) AND (bank_name IS NULL)=(bank_account_number IS NULL))
);

CREATE TABLE payment_claims (
 id uuid PRIMARY KEY,
 invoice_id uuid NOT NULL,
 merchant_id uuid NOT NULL,
 currency text NOT NULL,
 amount_minor minor_units NOT NULL CHECK(amount_minor>0),
 reference text NOT NULL UNIQUE CHECK(reference ~ '^[A-Z0-9][A-Z0-9/-]{5,79}$'),
 note text NOT NULL CHECK(length(note) BETWEEN 5 AND 500),
 submitted_by text NOT NULL REFERENCES "user"(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified','rejected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reviewed_by text REFERENCES "user"(id),
 reviewed_at timestamptz,
 review_reason text CHECK(length(review_reason) BETWEEN 5 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(invoice_id,merchant_id,currency) REFERENCES invoices(id,merchant_id,currency),
 CHECK((state='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
   OR (state<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL))
);
CREATE INDEX payment_claims_invoice ON payment_claims(invoice_id,state,created_at,id);
CREATE INDEX payment_claims_attention ON payment_claims(state,created_at,id) WHERE state='pending';

CREATE TABLE email_campaigns (
 id uuid PRIMARY KEY,
 subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 140 AND subject !~ '[\r\n]'),
 body text NOT NULL CHECK(length(body) BETWEEN 10 AND 5000),
 cta_label text CHECK(length(cta_label) BETWEEN 2 AND 50 AND cta_label !~ '[\r\n]'),
 cta_path text CHECK(cta_path ~ '^/[A-Za-z0-9/_?=&.-]{0,300}$'),
 audience text NOT NULL CHECK(audience IN ('all_shops','new_shops','specific_shops')),
 new_shop_days integer CHECK(new_shop_days BETWEEN 1 AND 365),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','completed','attention','cancelled')),
 recipient_count integer NOT NULL DEFAULT 0 CHECK(recipient_count>=0),
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 CHECK((audience='new_shops')=(new_shop_days IS NOT NULL)),
 CHECK((cta_label IS NULL)=(cta_path IS NULL))
);
CREATE TABLE email_campaign_targets (
 campaign_id uuid NOT NULL REFERENCES email_campaigns(id),
 shop_id uuid NOT NULL,
 merchant_id uuid NOT NULL,
 PRIMARY KEY(campaign_id,shop_id),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id)
);
CREATE TABLE email_campaign_recipients (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES email_campaigns(id),
 user_id text NOT NULL REFERENCES "user"(id),
 merchant_id uuid NOT NULL REFERENCES merchants(id),
 email text NOT NULL CHECK(email=lower(email)),
 job_id uuid UNIQUE REFERENCES jobs(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(campaign_id,user_id,merchant_id)
);
CREATE INDEX email_campaign_pending ON email_campaign_recipients(campaign_id,created_at,id) WHERE job_id IS NULL;

CREATE TABLE promotions (
 id uuid PRIMARY KEY,
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{3,31}$'),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
 description text NOT NULL CHECK(length(description) BETWEEN 10 AND 500),
 benefit text NOT NULL CHECK(benefit IN ('free_period','percentage','fixed')),
 percent_off integer CHECK(percent_off BETWEEN 1 AND 100),
 fixed_minor minor_units CHECK(fixed_minor>0),
 currency text CHECK(currency IN ('UGX','USD','KES','EUR','GBP')),
 audience text NOT NULL CHECK(audience IN ('all_shops','new_shops','specific_merchants')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 max_redemptions integer CHECK(max_redemptions BETWEEN 1 AND 1000000),
 active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((benefit='percentage')=(percent_off IS NOT NULL)),
 CHECK((benefit='fixed')=(fixed_minor IS NOT NULL AND currency IS NOT NULL)),
 CHECK(benefit='fixed' OR (fixed_minor IS NULL AND currency IS NULL))
);
CREATE TABLE promotion_targets (
 promotion_id uuid NOT NULL REFERENCES promotions(id),
 merchant_id uuid NOT NULL REFERENCES merchants(id),
 PRIMARY KEY(promotion_id,merchant_id)
);
CREATE TABLE promotion_redemptions (
 id uuid PRIMARY KEY,
 promotion_id uuid NOT NULL REFERENCES promotions(id),
 invoice_id uuid NOT NULL,
 merchant_id uuid NOT NULL,
 currency text NOT NULL,
 amount_minor minor_units NOT NULL CHECK(amount_minor>0),
 redeemed_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(invoice_id,merchant_id,currency) REFERENCES invoices(id,merchant_id,currency),
 UNIQUE(promotion_id,merchant_id),
 UNIQUE(invoice_id)
);

CREATE TABLE monthly_report_receipts (
 report_month date NOT NULL,
 shop_id uuid NOT NULL,
 merchant_id uuid NOT NULL,
 user_id text NOT NULL REFERENCES "user"(id),
 job_id uuid NOT NULL UNIQUE REFERENCES jobs(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(report_month,shop_id,user_id),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id),
 CHECK(report_month=date_trunc('month',report_month)::date)
);

CREATE FUNCTION protect_campaign_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id<>OLD.id OR NEW.subject<>OLD.subject OR NEW.body<>OLD.body OR NEW.cta_label IS DISTINCT FROM OLD.cta_label OR NEW.cta_path IS DISTINCT FROM OLD.cta_path OR NEW.audience<>OLD.audience OR NEW.new_shop_days IS DISTINCT FROM OLD.new_shop_days OR NEW.recipient_count<>OLD.recipient_count OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR OLD.state<>'queued' OR NEW.state NOT IN ('completed','attention','cancelled') THEN
  RAISE EXCEPTION 'Queued campaign content and audience are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER email_campaign_identity BEFORE UPDATE ON email_campaigns FOR EACH ROW EXECUTE FUNCTION protect_campaign_identity();
CREATE TRIGGER email_campaign_history BEFORE DELETE ON email_campaigns FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER payment_claim_history BEFORE DELETE ON payment_claims FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER promotion_redemption_history BEFORE UPDATE OR DELETE ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
