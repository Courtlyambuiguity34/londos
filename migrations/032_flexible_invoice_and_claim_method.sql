-- Flexible invoice terms and shopkeeper-reported payment channel.
-- Apply before deploying code that reads these columns.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS description text
    CHECK (description IS NULL OR length(description) BETWEEN 1 AND 1000),
  ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE payment_claims
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'other'
    CHECK (payment_method IN ('mtn_momo','airtel_money','bank_transfer','cash','other'));
