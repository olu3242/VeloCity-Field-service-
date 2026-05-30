-- Revenue Records: canonical table for all revenue attribution events
-- Captures platform fee, provider payout, and franchise royalty per job payment

CREATE TABLE IF NOT EXISTS public.revenue_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  job_id        uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  payment_id    uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  event_type    text NOT NULL DEFAULT 'payment_captured',

  gross_amount_cents        integer NOT NULL DEFAULT 0,
  platform_fee_cents        integer NOT NULL DEFAULT 0,
  provider_payout_cents     integer NOT NULL DEFAULT 0,
  franchise_royalty_cents   integer NOT NULL DEFAULT 0,
  net_platform_cents        integer GENERATED ALWAYS AS (platform_fee_cents - franchise_royalty_cents) STORED,

  franchise_territory_id    uuid REFERENCES public.franchise_territories(id) ON DELETE SET NULL,
  franchise_owner_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider_id               uuid REFERENCES public.providers(id) ON DELETE SET NULL,

  settled          boolean NOT NULL DEFAULT false,
  settled_at       timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS revenue_records_tenant_id_idx ON public.revenue_records(tenant_id);
CREATE INDEX IF NOT EXISTS revenue_records_job_id_idx    ON public.revenue_records(job_id);
CREATE INDEX IF NOT EXISTS revenue_records_created_at_idx ON public.revenue_records(created_at DESC);
CREATE INDEX IF NOT EXISTS revenue_records_settled_idx   ON public.revenue_records(settled) WHERE settled = false;

-- RLS
ALTER TABLE public.revenue_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_revenue_records"
  ON public.revenue_records
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "franchise_owner_view_own_revenue"
  ON public.revenue_records
  FOR SELECT
  TO authenticated
  USING (
    franchise_owner_id = auth.uid()
  );

CREATE POLICY "service_role_bypass_revenue"
  ON public.revenue_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.revenue_records IS 'Canonical revenue attribution per job payment — platform fee, franchise royalty, provider payout';
