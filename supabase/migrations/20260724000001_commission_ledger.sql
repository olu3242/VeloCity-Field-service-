-- Commission Ledger + Metered Usage Events
-- Persistent backing for src/lib/revenue-infra/commission-engine.ts and metered-billing.ts
-- These tables extend revenue_records (which handles job-level attribution)
-- with per-provider commission tracking and metered usage billing.

-- ── Commission Ledger ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  provider_id         text NOT NULL,
  transaction_amount  integer NOT NULL DEFAULT 0,  -- cents
  commission_rate     numeric(5, 4) NOT NULL,       -- e.g. 0.1500
  commission_amount   integer NOT NULL DEFAULT 0,  -- cents
  tier                text NOT NULL CHECK (tier IN ('standard', 'premium', 'enterprise')),
  settled             boolean NOT NULL DEFAULT false,
  settled_at          timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}',
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commission_ledger_tenant_idx  ON public.commission_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS commission_ledger_provider_idx ON public.commission_ledger(tenant_id, provider_id);
CREATE INDEX IF NOT EXISTS commission_ledger_settled_idx  ON public.commission_ledger(settled) WHERE NOT settled;
CREATE INDEX IF NOT EXISTS commission_ledger_created_idx  ON public.commission_ledger(created_at DESC);

ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_commission_ledger"
  ON public.commission_ledger FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "service_role_bypass_commission_ledger"
  ON public.commission_ledger FOR ALL TO service_role
  USING (true);

-- ── Metered Usage Events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.metered_usage_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  metric_type     text NOT NULL CHECK (metric_type IN (
    'ai_calls', 'events_processed', 'workflows_run', 'storage_gb', 'api_requests'
  )),
  quantity        numeric NOT NULL DEFAULT 0,
  unit_cost_usd   numeric(10, 6) NOT NULL DEFAULT 0,
  total_cost_usd  numeric(10, 4) GENERATED ALWAYS AS (quantity * unit_cost_usd) STORED,
  billing_period  text NOT NULL,  -- YYYY-MM
  metadata        jsonb NOT NULL DEFAULT '{}',
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS metered_usage_tenant_idx   ON public.metered_usage_events(tenant_id);
CREATE INDEX IF NOT EXISTS metered_usage_period_idx   ON public.metered_usage_events(tenant_id, billing_period);
CREATE INDEX IF NOT EXISTS metered_usage_metric_idx   ON public.metered_usage_events(tenant_id, metric_type);
CREATE INDEX IF NOT EXISTS metered_usage_created_idx  ON public.metered_usage_events(created_at DESC);

ALTER TABLE public.metered_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_metered_usage"
  ON public.metered_usage_events FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "service_role_bypass_metered_usage"
  ON public.metered_usage_events FOR ALL TO service_role
  USING (true);
