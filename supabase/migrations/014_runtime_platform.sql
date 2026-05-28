-- Migration 011: Runtime Platform — Stateful Workflows, Governance Violations,
--                Simulation Runs, Federation Network Nodes, Cloud Execution Slots
-- ADDITIVE ONLY — no drops, no alters to existing tables

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. stateful_workflow_states
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stateful_workflow_states (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      uuid        NOT NULL UNIQUE,
  workflow_type    text        NOT NULL,
  tenant_id        uuid,
  correlation_id   text        NOT NULL,
  status           text        NOT NULL DEFAULT 'initializing',
  step_index       int                  DEFAULT 0,
  total_steps      int         NOT NULL,
  variables        jsonb                DEFAULT '{}'::jsonb,
  failure_reason   text,
  retry_count      int                  DEFAULT 0,
  version          int                  DEFAULT 1,
  started_at       timestamptz          DEFAULT now(),
  updated_at       timestamptz          DEFAULT now(),
  completed_at     timestamptz
);

ALTER TABLE stateful_workflow_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stateful_workflow_states_tenant_policy ON stateful_workflow_states;
CREATE POLICY stateful_workflow_states_tenant_policy
  ON stateful_workflow_states
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. workflow_temporal_history
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_temporal_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid        NOT NULL,
  tenant_id   uuid,
  sequence    int         NOT NULL,
  event_type  text        NOT NULL,
  step_index  int,
  step_name   text,
  data        jsonb                DEFAULT '{}'::jsonb,
  occurred_at timestamptz          DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wth_workflow_sequence ON workflow_temporal_history (workflow_id, sequence);
CREATE INDEX IF NOT EXISTS idx_wth_tenant_id         ON workflow_temporal_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wth_event_type        ON workflow_temporal_history (event_type);

ALTER TABLE workflow_temporal_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_temporal_history_tenant_policy ON workflow_temporal_history;
CREATE POLICY workflow_temporal_history_tenant_policy
  ON workflow_temporal_history
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. governance_violations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS governance_violations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        text        NOT NULL,
  entity_type      text        NOT NULL,
  tenant_id        uuid,
  principle        text        NOT NULL,
  policy_id        uuid,
  severity         text        NOT NULL,
  description      text        NOT NULL,
  auto_remediated  boolean              DEFAULT false,
  resolution       text,
  detected_at      timestamptz          DEFAULT now(),
  resolved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gov_violations_tenant_id    ON governance_violations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gov_violations_principle    ON governance_violations (principle);
CREATE INDEX IF NOT EXISTS idx_gov_violations_severity     ON governance_violations (severity);
CREATE INDEX IF NOT EXISTS idx_gov_violations_resolved_at  ON governance_violations (resolved_at);

ALTER TABLE governance_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS governance_violations_tenant_policy ON governance_violations;
CREATE POLICY governance_violations_tenant_policy
  ON governance_violations
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. simulation_runs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulation_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mode           text        NOT NULL,
  tenant_id      uuid,
  correlation_id text,
  status         text        NOT NULL DEFAULT 'queued',
  parameters     jsonb                DEFAULT '{}'::jsonb,
  result         jsonb,
  duration_ms    int,
  error          text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz          DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulation_runs_tenant_id ON simulation_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_simulation_runs_mode      ON simulation_runs (mode);
CREATE INDEX IF NOT EXISTS idx_simulation_runs_status    ON simulation_runs (status);

ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS simulation_runs_tenant_policy ON simulation_runs;
CREATE POLICY simulation_runs_tenant_policy
  ON simulation_runs
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. federation_network_nodes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS federation_network_nodes (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id            text        NOT NULL,
  region                   text        NOT NULL,
  role                     text        NOT NULL DEFAULT 'observer',
  status                   text        NOT NULL DEFAULT 'handshaking',
  latency_ms               int                  DEFAULT 0,
  supported_workflow_types text[]               DEFAULT '{}'::text[],
  trusted_since            timestamptz,
  last_ping_at             timestamptz,
  joined_at                timestamptz          DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_federation_nodes_federation_id ON federation_network_nodes (federation_id);
CREATE INDEX IF NOT EXISTS idx_federation_nodes_region        ON federation_network_nodes (region);
CREATE INDEX IF NOT EXISTS idx_federation_nodes_status        ON federation_network_nodes (status);

ALTER TABLE federation_network_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS federation_network_nodes_open_policy ON federation_network_nodes;
CREATE POLICY federation_network_nodes_open_policy
  ON federation_network_nodes
  FOR ALL
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. cloud_execution_slots
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cloud_execution_slots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  execution_id text        NOT NULL,
  region       text        NOT NULL,
  priority     text        NOT NULL DEFAULT 'normal',
  status       text        NOT NULL DEFAULT 'active',
  allocated_at timestamptz          DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_slots_tenant_id  ON cloud_execution_slots (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_slots_status     ON cloud_execution_slots (status);
CREATE INDEX IF NOT EXISTS idx_cloud_slots_region     ON cloud_execution_slots (region);
CREATE INDEX IF NOT EXISTS idx_cloud_slots_expires_at ON cloud_execution_slots (expires_at);

ALTER TABLE cloud_execution_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cloud_execution_slots_tenant_policy ON cloud_execution_slots;
CREATE POLICY cloud_execution_slots_tenant_policy
  ON cloud_execution_slots
  FOR ALL
  USING (tenant_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Realtime publications
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE stateful_workflow_states;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE governance_violations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cloud_execution_slots;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
