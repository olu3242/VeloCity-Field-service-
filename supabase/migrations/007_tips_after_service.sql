-- ============================================================
-- VeloCity — Migration 006: Tip After Service
-- ============================================================
-- One tip per job per customer (enforced via unique index).
-- Tips carry 0% platform commission — 100% goes to provider.
-- Payment is handled via Stripe PaymentIntent (with dev fallback).
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_tips (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                   UUID        NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  customer_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_id              UUID        NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  amount_cents             INTEGER     NOT NULL CHECK (amount_cents > 0),
  currency                 TEXT        NOT NULL DEFAULT 'usd',
  note                     TEXT        CHECK (char_length(note) <= 500),
  payment_status           TEXT        NOT NULL DEFAULT 'pending'
                                       CHECK (payment_status IN ('pending','succeeded','failed')),
  stripe_payment_intent_id TEXT,
  stripe_transfer_id       TEXT,
  idempotency_key          TEXT        UNIQUE,  -- prevents duplicate charges
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One tip per job per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_tips_one_per_job
  ON provider_tips(job_id, customer_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tips_job_id       ON provider_tips(job_id);
CREATE INDEX IF NOT EXISTS idx_tips_provider_id  ON provider_tips(provider_id);
CREATE INDEX IF NOT EXISTS idx_tips_customer_id  ON provider_tips(customer_id);
CREATE INDEX IF NOT EXISTS idx_tips_status       ON provider_tips(payment_status);
CREATE INDEX IF NOT EXISTS idx_tips_created_at   ON provider_tips(created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_provider_tips_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_provider_tips_updated_at
  BEFORE UPDATE ON provider_tips
  FOR EACH ROW EXECUTE FUNCTION update_provider_tips_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE provider_tips ENABLE ROW LEVEL SECURITY;

-- Customer: insert and view own tips
CREATE POLICY "customer_insert_own_tip" ON provider_tips
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "customer_view_own_tips" ON provider_tips
  FOR SELECT TO authenticated
  USING (auth.uid() = customer_id);

-- Provider: view tips received
CREATE POLICY "provider_view_received_tips" ON provider_tips
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
    )
  );

-- Admin / service role: full access
CREATE POLICY "service_role_tips_full" ON provider_tips
  USING (auth.role() = 'service_role');
