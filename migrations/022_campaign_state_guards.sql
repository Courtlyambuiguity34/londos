CREATE OR REPLACE FUNCTION protect_campaign_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id<>OLD.id
    OR NEW.subject<>OLD.subject
    OR NEW.body<>OLD.body
    OR NEW.cta_label IS DISTINCT FROM OLD.cta_label
    OR NEW.cta_path IS DISTINCT FROM OLD.cta_path
    OR NEW.audience<>OLD.audience
    OR NEW.new_shop_days IS DISTINCT FROM OLD.new_shop_days
    OR NEW.created_by<>OLD.created_by
    OR NEW.created_at<>OLD.created_at
    OR OLD.state<>'queued'
    OR NOT (
      (NEW.state='queued' AND NEW.completed_at IS NULL AND NEW.recipient_count>=OLD.recipient_count)
      OR
      (NEW.state IN ('completed','attention','cancelled') AND NEW.completed_at IS NOT NULL AND NEW.recipient_count=OLD.recipient_count)
    ) THEN
  RAISE EXCEPTION 'Queued campaign content and audience are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
