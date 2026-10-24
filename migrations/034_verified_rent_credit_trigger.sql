-- Allow the production operator's independently verified payment credit.
-- Preserve amount bounds, ledger immutability, reversal validation and tenant locking.
CREATE OR REPLACE FUNCTION verify_workflow_rent_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target invoices%ROWTYPE; original rent_events%ROWTYPE; credited numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM rent_invoice_state WHERE invoice_id=NEW.invoice_id) THEN RETURN NEW; END IF;
 SELECT * INTO target FROM invoices WHERE id=NEW.invoice_id;
 PERFORM id FROM merchants WHERE id=target.merchant_id FOR UPDATE;
 IF NEW.kind IN ('payment','waiver') THEN
  IF NEW.amount_minor<=0 OR
     (NEW.kind='payment' AND NEW.source NOT IN ('local-manual','operator-verified')) OR
     (NEW.kind='waiver' AND NEW.source<>'local-manual')
  THEN RAISE EXCEPTION 'Invalid workflow credit' USING ERRCODE='23514'; END IF;
 ELSIF NEW.kind='adjustment' THEN
  SELECT * INTO original FROM rent_events
    WHERE id::text=NEW.source_reference AND invoice_id=NEW.invoice_id
      AND kind IN ('payment','waiver') AND source='local-manual';
  IF NOT FOUND OR NEW.source<>'local-reversal' OR NEW.amount_minor<>-original.amount_minor
  THEN RAISE EXCEPTION 'Invalid workflow reversal' USING ERRCODE='23514'; END IF;
 ELSE
  RAISE EXCEPTION 'Invoice already represents the workflow charge' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(amount_minor),0) INTO credited FROM rent_events WHERE invoice_id=NEW.invoice_id;
 IF credited+NEW.amount_minor<0 OR credited+NEW.amount_minor>target.amount_minor
 THEN RAISE EXCEPTION 'Workflow credit exceeds invoice bounds' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
