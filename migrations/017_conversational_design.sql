CREATE TABLE ai_design_requests (
 id uuid PRIMARY KEY, merchant_id uuid NOT NULL REFERENCES merchants(id), shop_id uuid NOT NULL,
 actor_id text NOT NULL REFERENCES "user"(id), request_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 base_version integer NOT NULL CHECK(base_version>=0), context_digest text NOT NULL CHECK(length(context_digest)=64),
 lease_token uuid NOT NULL, lease_until timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('running','proposed','applied','rejected','cancelled','expired','failed','unavailable','rate_limited','conflict')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 candidate jsonb, patches jsonb, path text CHECK(path IN ('deterministic','gemini','openai')),
 review_warning boolean NOT NULL DEFAULT false, review_status text NOT NULL DEFAULT 'not_needed' CHECK(length(review_status)<=64),
 failure_code text CHECK(length(failure_code)<=64), expires_at timestamptz NOT NULL,
 command_action text CHECK(command_action IN ('apply','reject','cancel')), command_version integer, command_warning boolean,
 result_version integer, result_revision integer,
 reserved_tokens integer NOT NULL DEFAULT 0 CHECK(reserved_tokens>=0), reserved_cost_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_cost_microusd>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,request_key), UNIQUE(id,merchant_id,shop_id),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id),
 FOREIGN KEY(shop_id,result_revision) REFERENCES shop_revisions(shop_id,revision),
 CHECK(candidate IS NULL OR (status='proposed' AND octet_length(candidate::text)<=10000)),
 CHECK(patches IS NULL OR (status='proposed' AND octet_length(patches::text)<=10000)),
 CHECK((status='proposed')=(candidate IS NOT NULL AND patches IS NOT NULL)),
 CHECK((status='applied')=(result_version IS NOT NULL AND result_revision IS NOT NULL AND command_action='apply'))
);
CREATE INDEX ai_design_shop_recent ON ai_design_requests(shop_id,actor_id,created_at DESC);
CREATE INDEX ai_design_running ON ai_design_requests(lease_until,shop_id) WHERE status='running';
CREATE INDEX ai_design_expiry ON ai_design_requests(expires_at) WHERE status IN ('running','proposed');
CREATE TABLE ai_daily_budgets (
 shop_id uuid NOT NULL REFERENCES shops(id), day date NOT NULL,
 requests integer NOT NULL DEFAULT 0 CHECK(requests>=0), reserved_tokens bigint NOT NULL DEFAULT 0 CHECK(reserved_tokens>=0), reserved_cost_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_cost_microusd>=0),
 PRIMARY KEY(shop_id,day)
);
CREATE TABLE ai_provider_cooldowns (provider text PRIMARY KEY CHECK(provider IN ('gemini','openai')),not_before timestamptz NOT NULL);
CREATE TABLE ai_provider_attempts (
 id uuid PRIMARY KEY, request_id uuid NOT NULL, merchant_id uuid NOT NULL, shop_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('gemini','openai')), model text NOT NULL CHECK(length(model)<=80),
 verification text NOT NULL CHECK(verification IN ('live_transport','fixture')), purpose text NOT NULL CHECK(purpose IN ('design','repair','review')),
 outcome text NOT NULL CHECK(outcome IN ('valid','unavailable','rate_limited','authentication','timeout','cancelled','invalid_response')),
 latency_ms integer NOT NULL CHECK(latency_ms>=0), input_tokens integer CHECK(input_tokens>=0), output_tokens integer CHECK(output_tokens>=0),
 estimated_cost_microusd bigint CHECK(estimated_cost_microusd>=0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(request_id,merchant_id,shop_id) REFERENCES ai_design_requests(id,merchant_id,shop_id)
);
CREATE INDEX ai_attempts_shop_time ON ai_provider_attempts(shop_id,created_at);
CREATE FUNCTION protect_ai_request_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.merchant_id,NEW.shop_id,NEW.actor_id,NEW.request_key,NEW.fingerprint,NEW.base_version,NEW.context_digest,NEW.lease_token,NEW.lease_until,NEW.expires_at,NEW.reserved_tokens,NEW.reserved_cost_microusd,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.merchant_id,OLD.shop_id,OLD.actor_id,OLD.request_key,OLD.fingerprint,OLD.base_version,OLD.context_digest,OLD.lease_token,OLD.lease_until,OLD.expires_at,OLD.reserved_tokens,OLD.reserved_cost_microusd,OLD.created_at) THEN RAISE EXCEPTION 'immutable AI request identity'; END IF;
 IF OLD.status NOT IN ('running','proposed') THEN RAISE EXCEPTION 'terminal AI request'; END IF;
 IF OLD.status=NEW.status OR (OLD.status='running' AND NEW.status='applied') OR (OLD.status='proposed' AND NEW.status NOT IN ('applied','rejected','cancelled','expired')) THEN RAISE EXCEPTION 'invalid AI request transition'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'AI request version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_request_identity BEFORE UPDATE ON ai_design_requests FOR EACH ROW EXECUTE FUNCTION protect_ai_request_identity();
CREATE FUNCTION reject_ai_history_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable AI history'; END $$;
CREATE TRIGGER ai_request_no_delete BEFORE DELETE ON ai_design_requests FOR EACH ROW EXECUTE FUNCTION reject_ai_history_change();
CREATE TRIGGER ai_attempts_immutable BEFORE UPDATE OR DELETE ON ai_provider_attempts FOR EACH ROW EXECUTE FUNCTION reject_ai_history_change();
