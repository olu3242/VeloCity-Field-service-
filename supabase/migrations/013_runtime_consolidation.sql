-- Migration 013: Runtime Consolidation — Trace Lineage, Execution Ancestry,
--                Determinism Verifications, Safety Evaluations,
--                Governance Overrides, Performance Metrics
-- ADDITIVE ONLY — no drops, no alters to existing tables

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. runtime_trace_lineage
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runtime_trace_lineage (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id         text        NOT NULL,
  root_operation   text        NOT NULL,
  correlation_id   text        NOT NULL,
  tenant_id        uuid,
  span_count       int                  DEFAULT 0,
  status           text                 DEFAULT 'active',
  started_at       timestamptz          DEFAULT now(),
  completed_at     timestamptz,
  propagated_to    text[]               DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_rtl_trace_id       ON runtime_trace_lineage (trace_id);
CREATE INDEX IF NOT EXISTS idx_rtl_correlation_id ON runtime_trace_lineage (correlation_id);
CREATE INDEX IF NOT EXISTS idx_rtl_tenant_id      ON runtime_trace_lineage (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rtl_status         ON runtime_trace_lineage (status);

ALTER TABLE runtime_trace_lineage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_runtime_trace_lineage"
    ON runtime_trace_lineage
    FOR ALL
    TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. execution_ancestry_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_ancestry_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id         text        NOT NULL,
  parent_execution_id  text,
  root_execution_id    text        NOT NULL,
  depth                int                  DEFAULT 0,
  workflow_type        text        NOT NULL,
  correlation_id       text        NOT NULL,
  tenant_id            uuid,
  created_at           timestamptz          DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eal_execution_id      ON execution_ancestry_log (execution_id);
CREATE INDEX IF NOT EXISTS idx_eal_root_execution_id ON execution_ancestry_log (root_execution_id);
CREATE INDEX IF NOT EXISTS idx_eal_correlation_id    ON execution_ancestry_log (correlation_id);
CREATE INDEX IF NOT EXISTS idx_eal_tenant_id         ON execution_ancestry_log (tenant_id);

ALTER TABLE execution_ancestry_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_execution_ancestry_log"
    ON execution_ancestry_log
    FOR ALL
    TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. determinism_verifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS determinism_verifications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id        text        NOT NULL,
  tenant_id           uuid,
  deterministic_score numeric              DEFAULT 100,
  overall_passed      boolean              DEFAULT true,
  checks              jsonb                DEFAULT '[]',
  verified_at         timestamptz          DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dv_execution_id   ON determinism_verifications (execution_id);
CREATE INDEX IF NOT EXISTS idx_dv_tenant_id      ON determinism_verifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dv_overall_passed ON determinism_verifications (overall_passed);

ALTER TABLE determinism_verifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_determinism_verifications"
    ON determinism_verifications
    FOR ALL
    TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. safety_evaluations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_evaluations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain         text        NOT NULL,
  entity_id      text        NOT NULL,
  tenant_id      uuid,
  safety_level   text        NOT NULL,
  safety_score   numeric              DEFAULT 100,
  risk_factors   text[]               DEFAULT '{}',
  approved       boolean              DEFAULT true,
  evaluated_at   timestamptz          DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_se_entity_id    ON safety_evaluations (entity_id);
CREATE INDEX IF NOT EXISTS idx_se_domain       ON safety_evaluations (domain);
CREATE INDEX IF NOT EXISTS idx_se_tenant_id    ON safety_evaluations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_se_safety_level ON safety_evaluations (safety_level);
CREATE INDEX IF NOT EXISTS idx_se_approved     ON safety_evaluations (approved);

ALTER TABLE safety_evaluations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_safety_evaluations"
    ON safety_evaluations
    FOR ALL
    TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Realtime for safety_evaluations
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE safety_evaluations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. governance_overrides_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS governance_overrides_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_action_id     text        NOT NULL,
  target_action_type   text        NOT NULL,
  tenant_id            uuid,
  override_type        text        NOT NULL,
  issued_by            text        NOT NULL,
  reason               text,
  applies_to           text                 DEFAULT 'single',
  active               boolean              DEFAULT true,
  applied_at           timestamptz          DEFAULT now(),
  expires_at           timestamptz,
  deactivated_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gol_target_action_id   ON governance_overrides_log (target_action_id);
CREATE INDEX IF NOT EXISTS idx_gol_target_action_type ON governance_overrides_log (target_action_type);
CREATE INDEX IF NOT EXISTS idx_gol_tenant_id          ON governance_overrides_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gol_active             ON governance_overrides_log (active);

ALTER TABLE governance_overrides_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_governance_overrides_log"
    ON governance_overrides_log
    FOR ALL
    TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Realtime for governance_overrides_log
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE governance_overrides_log;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. performance_metrics
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_metrics (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem             text        NOT NULL,
  tenant_id             uuid,
  metric_type           text        NOT NULL,
  value                 numeric     NOT NULL,
  window_start_at       timestamptz          DEFAULT now(),
  throughput_per_minute numeric,
  p95_duration_ms       numeric,
  p99_duration_ms       numeric,
  slo_met               boolean,
  bottleneck_detected   boolean              DEFAULT false,
  recorded_at           timestamptz          DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_subsystem   ON performance_metrics (subsystem);
CREATE INDEX IF NOT EXISTS idx_pm_tenant_id   ON performance_metrics (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_metric_type ON performance_metrics (metric_type);
CREATE INDEX IF NOT EXISTS idx_pm_recorded_at ON performance_metrics (recorded_at);

ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation_performance_metrics"
    ON performance_metrics
    FOR ALL
    TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
