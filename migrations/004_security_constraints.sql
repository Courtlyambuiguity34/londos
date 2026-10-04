ALTER TABLE "user" ADD CONSTRAINT user_email_normalized CHECK(email=lower(email));
CREATE UNIQUE INDEX account_provider_identity ON account("providerId","accountId");
CREATE UNIQUE INDEX factor_user_identity ON "twoFactor"("userId");
ALTER TABLE session ADD CONSTRAINT session_actor_identity UNIQUE(id,"userId");
ALTER TABLE mfa_proofs ADD CONSTRAINT proof_session_actor FOREIGN KEY(session_id,user_id) REFERENCES session(id,"userId") ON DELETE CASCADE;
CREATE TABLE request_budgets (key text NOT NULL, window_id bigint NOT NULL, count integer NOT NULL CHECK(count>0), PRIMARY KEY(key,window_id));
CREATE TABLE operator_shop_scopes (user_id text NOT NULL REFERENCES "user"(id), shop_id uuid NOT NULL REFERENCES shops(id), PRIMARY KEY(user_id,shop_id));
