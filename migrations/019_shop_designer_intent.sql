ALTER TABLE ai_design_requests
  ADD COLUMN decisions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE ai_design_requests
  ADD CONSTRAINT ai_design_decisions_array
  CHECK (
    jsonb_typeof(decisions)='array'
    AND octet_length(decisions::text)<=4000
  );
