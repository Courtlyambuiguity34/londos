ALTER TABLE operator_grants DROP CONSTRAINT operator_grants_permission_check;
ALTER TABLE operator_grants ADD CONSTRAINT operator_grants_permission_check CHECK(permission IN ('support','review','finance','moderation','recovery','jobs','operations','analytics','privacy'));
CREATE TABLE privacy_policies (
 id uuid PRIMARY KEY, label text NOT NULL, terminal_days integer NOT NULL CHECK(terminal_days BETWEEN 30 AND 3650),
 development_only boolean NOT NULL CHECK(development_only), created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO privacy_policies VALUES('91000000-0000-4000-8000-000000000001','Development: manual review, 30 days after closure/rejection; protected history retained',30,true,now());
CREATE TRIGGER privacy_policy_immutable BEFORE UPDATE OR DELETE ON privacy_policies FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE privacy_requests (
 id uuid PRIMARY KEY, merchant_id uuid NOT NULL REFERENCES merchants(id), requester_id text NOT NULL REFERENCES "user"(id),
 kind text NOT NULL CHECK(kind IN ('enquiry','verification','analytics','history')), target_id uuid NOT NULL,
 request_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64), requester_reason text NOT NULL CHECK(length(requester_reason) BETWEEN 5 AND 500),
 policy_id uuid NOT NULL REFERENCES privacy_policies(id),
 state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','reviewing','held','approved','completed','denied','cancelled')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), assigned_user text REFERENCES "user"(id), public_reason text NOT NULL DEFAULT '' CHECK(length(public_reason)<=500),
 approval_session text, approval_until timestamptz, approval_hash text CHECK(length(approval_hash)=64),
 result jsonb NOT NULL DEFAULT '{}' CHECK(octet_length(result::text)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(requester_id,request_key), UNIQUE(id,merchant_id), UNIQUE(id,merchant_id,kind,target_id),
 CHECK((state<>'approved' AND approval_session IS NULL AND approval_until IS NULL AND approval_hash IS NULL) OR (state='approved' AND assigned_user IS NOT NULL AND approval_session IS NOT NULL AND approval_until IS NOT NULL AND approval_hash IS NOT NULL))
);
CREATE INDEX privacy_owner_queue ON privacy_requests(merchant_id,created_at DESC,id);
CREATE INDEX privacy_operator_queue ON privacy_requests(state,created_at,id);
CREATE FUNCTION preserve_privacy_request_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.id,NEW.merchant_id,NEW.requester_id,NEW.kind,NEW.target_id,NEW.request_key,NEW.fingerprint,NEW.requester_reason,NEW.policy_id,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.merchant_id,OLD.requester_id,OLD.kind,OLD.target_id,OLD.request_key,OLD.fingerprint,OLD.requester_reason,OLD.policy_id,OLD.created_at)
 THEN RAISE EXCEPTION 'Privacy request identity is immutable'; END IF;
 IF OLD.state IN ('completed','denied','cancelled') THEN RAISE EXCEPTION 'Closed privacy request is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_request_identity BEFORE UPDATE ON privacy_requests FOR EACH ROW EXECUTE FUNCTION preserve_privacy_request_identity();
CREATE TRIGGER privacy_request_retained BEFORE DELETE ON privacy_requests FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE operator_privacy_scopes (
 user_id text NOT NULL REFERENCES "user"(id), case_id uuid NOT NULL REFERENCES privacy_requests(id), PRIMARY KEY(user_id,case_id)
);
CREATE TABLE privacy_holds (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, merchant_id uuid NOT NULL, kind text NOT NULL, target_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500), created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 released_by text REFERENCES "user"(id), released_at timestamptz,
 FOREIGN KEY(case_id,merchant_id,kind,target_id) REFERENCES privacy_requests(id,merchant_id,kind,target_id),
 CHECK((released_at IS NULL)=(released_by IS NULL))
);
CREATE UNIQUE INDEX privacy_active_hold ON privacy_holds(merchant_id,kind,target_id) WHERE released_at IS NULL;
CREATE FUNCTION preserve_privacy_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.id,NEW.case_id,NEW.merchant_id,NEW.kind,NEW.target_id,NEW.reason,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.case_id,OLD.merchant_id,OLD.kind,OLD.target_id,OLD.reason,OLD.created_by,OLD.created_at)
 OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN RAISE EXCEPTION 'Retention hold history is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_hold_identity BEFORE UPDATE ON privacy_holds FOR EACH ROW EXECUTE FUNCTION preserve_privacy_hold();
CREATE TRIGGER privacy_hold_retained BEFORE DELETE ON privacy_holds FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE privacy_events (
 id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES privacy_requests(id), actor_id text NOT NULL REFERENCES "user"(id),
 kind text NOT NULL CHECK(kind IN ('created','claimed','hold','release','approve','complete','deny','cancel','blocked','unassign')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500), public_reason text NOT NULL DEFAULT '' CHECK(length(public_reason)<=500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX privacy_history ON privacy_events(case_id,created_at,id);
CREATE TRIGGER privacy_event_immutable BEFORE UPDATE OR DELETE ON privacy_events FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TABLE shop_privacy_exclusions (
 shop_id uuid PRIMARY KEY, merchant_id uuid NOT NULL, case_id uuid NOT NULL, kind text NOT NULL DEFAULT 'analytics' CHECK(kind='analytics'), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,merchant_id) REFERENCES shops(id,merchant_id), FOREIGN KEY(case_id,merchant_id,kind,shop_id) REFERENCES privacy_requests(id,merchant_id,kind,target_id)
);
CREATE TRIGGER privacy_exclusion_immutable BEFORE UPDATE OR DELETE ON shop_privacy_exclusions FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
ALTER TABLE guest_requests ADD COLUMN closed_at timestamptz;
ALTER TABLE guest_requests ADD COLUMN erased_at timestamptz;
UPDATE guest_requests SET closed_at=now() WHERE status='closed';
CREATE FUNCTION protect_enquiry_retention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.erased_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot insert erased enquiry'; END IF;
  NEW.closed_at=CASE WHEN NEW.status='closed' THEN coalesce(NEW.closed_at,clock_timestamp()) ELSE NULL END;
 ELSE
  IF (NEW.id,NEW.shop_id,NEW.merchant_id,NEW.product_id,NEW.request_key,NEW.fingerprint,NEW.kind,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.shop_id,OLD.merchant_id,OLD.product_id,OLD.request_key,OLD.fingerprint,OLD.kind,OLD.created_at) THEN RAISE EXCEPTION 'Enquiry retry identity is immutable'; END IF;
  IF OLD.erased_at IS NOT NULL THEN
   IF (NEW.name,NEW.reply_to,NEW.message,NEW.erased_at,NEW.status,NEW.closed_at)
   IS DISTINCT FROM (OLD.name,OLD.reply_to,OLD.message,OLD.erased_at,OLD.status,OLD.closed_at)
   THEN RAISE EXCEPTION 'Erased enquiry cannot be restored'; END IF;
  ELSE
   NEW.closed_at=CASE WHEN NEW.status='closed' THEN CASE WHEN OLD.status='closed' THEN OLD.closed_at ELSE clock_timestamp() END ELSE NULL END;
   IF NEW.erased_at IS NOT NULL AND (OLD.status<>'closed' OR OLD.closed_at IS NULL OR NEW.name<>'[Erased]' OR NEW.reply_to<>'[Erased]' OR NEW.message<>'[Erased]')
   THEN RAISE EXCEPTION 'Invalid enquiry erasure'; END IF;
   IF NEW.erased_at IS NOT NULL AND (NOT privacy_erasure_authorized('enquiry',OLD.id,OLD.merchant_id) OR NOT EXISTS(SELECT 1 FROM privacy_requests r JOIN privacy_policies p ON p.id=r.policy_id WHERE r.id::text=current_setting('londos.privacy_case',true) AND OLD.closed_at<=clock_timestamp()-p.terminal_days*interval '1 day')) THEN RAISE EXCEPTION 'Enquiry erasure is not governed' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enquiry_retention BEFORE INSERT OR UPDATE ON guest_requests FOR EACH ROW EXECUTE FUNCTION protect_enquiry_retention();

CREATE FUNCTION verify_privacy_target() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.kind='enquiry' AND NOT EXISTS(SELECT 1 FROM guest_requests WHERE id=NEW.target_id AND merchant_id=NEW.merchant_id))
 OR (NEW.kind='verification' AND NOT EXISTS(SELECT 1 FROM applications WHERE id=NEW.target_id AND merchant_id=NEW.merchant_id AND applicant_id=NEW.requester_id))
 OR (NEW.kind IN ('analytics','history') AND NOT EXISTS(SELECT 1 FROM shops WHERE id=NEW.target_id AND merchant_id=NEW.merchant_id))
 THEN RAISE EXCEPTION 'Privacy target is not tenant/subject consistent' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_target BEFORE INSERT ON privacy_requests FOR EACH ROW EXECUTE FUNCTION verify_privacy_target();

CREATE FUNCTION privacy_erasure_authorized(resource_kind text,resource_id uuid,tenant_id uuid) RETURNS boolean LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM privacy_requests r JOIN privacy_policies policy ON policy.id=r.policy_id AND policy.development_only
 JOIN operator_privacy_scopes scope ON scope.case_id=r.id AND scope.user_id=r.assigned_user
 JOIN operator_grants g ON g.user_id=r.assigned_user AND g.permission='privacy'
 JOIN session s ON s.id=r.approval_session AND s."userId"=r.assigned_user AND s."expiresAt">clock_timestamp()
 JOIN "user" u ON u.id=r.assigned_user AND u."emailVerified" AND u."twoFactorEnabled"
 JOIN mfa_proofs proof ON proof.session_id=s.id AND proof.user_id=u.id AND proof.auth_epoch=u.auth_epoch AND proof.verified_at>=clock_timestamp()-interval '5 minutes'
 JOIN memberships owner ON owner.merchant_id=r.merchant_id AND owner.user_id=r.requester_id AND owner.role='owner' AND owner.status='active'
 WHERE r.id::text=current_setting('londos.privacy_case',true) AND r.state='approved' AND r.approval_until>clock_timestamp()
 AND r.kind=resource_kind AND r.target_id=resource_id AND r.merchant_id=tenant_id
 AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.merchant_id=r.merchant_id AND m.user_id=r.assigned_user AND m.status='active')
 AND NOT EXISTS(SELECT 1 FROM privacy_holds h WHERE h.merchant_id=r.merchant_id AND h.kind=r.kind AND h.target_id=r.target_id AND h.released_at IS NULL))
$$;
CREATE FUNCTION protect_verification_erasure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT privacy_erasure_authorized('verification',OLD.application_id,OLD.merchant_id) OR NOT EXISTS(
 SELECT 1 FROM applications a JOIN privacy_requests r ON r.target_id=a.id JOIN privacy_policies p ON p.id=r.policy_id
 WHERE r.id::text=current_setting('londos.privacy_case',true) AND a.state='rejected' AND a.applicant_id=r.requester_id
 AND a.updated_at<=clock_timestamp()-p.terminal_days*interval '1 day'
 AND NOT EXISTS(SELECT 1 FROM invoices WHERE application_id=a.id) AND NOT EXISTS(SELECT 1 FROM rent_contracts WHERE application_id=a.id))
 THEN RAISE EXCEPTION 'Verification erasure is not governed' USING ERRCODE='23514'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER verification_erasure BEFORE DELETE ON application_evidence FOR EACH ROW EXECUTE FUNCTION protect_verification_erasure();
CREATE FUNCTION protect_analytics_exclusion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT privacy_erasure_authorized('analytics',NEW.shop_id,NEW.merchant_id) THEN RAISE EXCEPTION 'Analytics exclusion is not governed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER analytics_exclusion BEFORE INSERT ON shop_privacy_exclusions FOR EACH ROW EXECUTE FUNCTION protect_analytics_exclusion();
