-- Migration 010: Execution Memory, Workflow Snapshots, AI Decision Lineage,
--                Remediation Patterns, and Optimization History
-- ADDITIVE ONLY — no drops, no alters to existing tables

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. execution_memories
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_memories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type       text        NOT NULL,
  workflow_id       uuid,
  tenant_id         uuid,
  correlation_id    text        NOT NULL,
  content           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  confidence        numeric     NOT NULL DEFAULT 0,
  relevance_score   numeric     NOT NULL DEFAULT 0,
  access_count      int         NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_accessed_at  timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_execution_memories_tenant_id    ON execution_memories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_execution_memories_workflow_id  ON execution_memories (workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_memories_expires_at   ON execution_memories (expires_at);

ALTER TABLE execution_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS execution_memories_tenant_policy ON execution_memories;
CREATE POLICY execution_memories_tenant_policy
  ON execution_memories
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. workflow_snapshots
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       uuid        NOT NULL,
  tenant_id         uuid,
  workflow_type     text        NOT NULL,
  step_index        int         NOT NULL,
  total_steps       int         NOT NULL,
  state             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  snapshot_reason   text        NOT NULL,
  confidence_score  numeric     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  version           int         NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_workflow_snapshots_tenant_id   ON workflow_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_snapshots_workflow_id ON workflow_snapshots (workflow_id);

ALTER TABLE workflow_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_snapshots_tenant_policy ON workflow_snapshots;
CREATE POLICY workflow_snapshots_tenant_policy
  ON workflow_snapshots
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ai_decision_lineage
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_decision_lineage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid,
  correlation_id text        NOT NULL,
  workflow_id    uuid,
  agent_name     text        NOT NULL,
  decision_type  text        NOT NULL,
  input          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  output         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  confidence     numeric     NOT NULL DEFAULT 0,
  reasoning      text,
  outcome        text,
  decided_at     timestamptz NOT NULL DEFAULT now(),
  evaluated_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_decision_lineage_tenant_id   ON ai_decision_lineage (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_lineage_workflow_id ON ai_decision_lineage (workflow_id);

ALTER TABLE ai_decision_lineage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_decision_lineage_tenant_policy ON ai_decision_lineage;
CREATE POLICY ai_decision_lineage_tenant_policy
  ON ai_decision_lineage
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. remediation_patterns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remediation_patterns (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid,
  correlation_id          text        NOT NULL,
  failure_pattern         text        NOT NULL,
  action_taken            text        NOT NULL,
  action_params           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  outcome                 text        NOT NULL,
  time_to_resolution_ms   int,
  confidence              numeric     NOT NULL DEFAULT 0,
  applied_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remediation_patterns_tenant_id       ON remediation_patterns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_remediation_patterns_failure_pattern ON remediation_patterns (failure_pattern);

ALTER TABLE remediation_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS remediation_patterns_tenant_policy ON remediation_patterns;
CREATE POLICY remediation_patterns_tenant_policy
  ON remediation_patterns
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. optimization_history
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS optimization_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid,
  workflow_type        text        NOT NULL,
  optimization_type    text        NOT NULL,
  previous_value       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  new_value            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  expected_improvement numeric     NOT NULL DEFAULT 0,
  actual_improvement   numeric,
  applied_at           timestamptz NOT NULL DEFAULT now(),
  measured_at          timestamptz,
  status               text        NOT NULL DEFAULT 'applied'
);

CREATE INDEX IF NOT EXISTS idx_optimization_history_tenant_id ON optimization_history (tenant_id);

ALTER TABLE optimization_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS optimization_history_tenant_policy ON optimization_history;
CREATE POLICY optimization_history_tenant_policy
  ON optimization_history
  FOR ALL
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Realtime publications
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'execution_memories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE execution_memories;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'ai_decision_lineage'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_decision_lineage;
  END IF;
END;
$$;
