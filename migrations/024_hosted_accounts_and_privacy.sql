-- Additive bootstrap receipts prevent redeployments from restoring revoked grants or passwords.
CREATE TABLE bootstrap_accounts (
 role text PRIMARY KEY CHECK(role IN ('admin','shopkeeper')),
 user_id text NOT NULL UNIQUE REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER bootstrap_accounts_append_only BEFORE UPDATE OR DELETE ON bootstrap_accounts
 FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE account_policy_acceptances (
 user_id text NOT NULL REFERENCES "user"(id), policy_version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,policy_version)
);
CREATE TRIGGER account_policy_acceptances_append_only BEFORE UPDATE OR DELETE ON account_policy_acceptances
 FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
ALTER TABLE privacy_policies DROP CONSTRAINT privacy_policies_development_only_check;
INSERT INTO privacy_policies(id,label,terminal_days,development_only)
 VALUES('91000000-0000-4000-8000-000000000002','Hosted manual review; automated erasure disabled',30,false);
ALTER TABLE privacy_events DROP CONSTRAINT privacy_events_kind_check;
ALTER TABLE privacy_events ADD CONSTRAINT privacy_events_kind_check
 CHECK(kind IN ('created','claimed','hold','release','approve','complete','deny','cancel','blocked','unassign','resolve'));
