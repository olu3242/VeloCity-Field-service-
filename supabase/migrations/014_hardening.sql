-- Migration 014: Hardening tables for orchestration, memory federation,
-- self-healing, execution economics, federation governance, and distributed scale.
-- Additive only — no drops, no alters.

-- ─── orchestration_hardening_log ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orchestration_hardening_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id     text NOT NULL,
  event_type           text NOT NULL,
  tenant_id            uuid,
  resilience_score     numeric,
  dag_cycles           int DEFAULT 0,
  checkpoints_created  int DEFAULT 0,
  rollbacks_triggered  int DEFAULT 0,
  deadlocks_resolved   int DEFAULT 0,
  recorded_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orchestration_hardening_log_orchestration_id_idx
  ON orchestration_hardening_log (orchestration_id);
CREATE INDEX IF NOT EXISTS orchestration_hardening_log_tenant_id_idx
  ON orchestration_hardening_log (tenant_id);
CREATE INDEX IF NOT EXISTS orchestration_hardening_log_event_type_idx
  ON orchestration_hardening_log (event_type);

ALTER TABLE orchestration_hardening_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orchestration_hardening_log_tenant_policy"
  ON orchestration_hardening_log
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─── memory_federation_log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_federation_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id          text NOT NULL,
  operation           text NOT NULL,
  tenant_id           uuid,
  freshness_score     numeric,
  federation_nodes    int DEFAULT 0,
  conflicts_resolved  int DEFAULT 0,
  lineage_valid       boolean DEFAULT true,
  recorded_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_federation_log_context_id_idx
  ON memory_federation_log (context_id);
CREATE INDEX IF NOT EXISTS memory_federation_log_tenant_id_idx
  ON memory_federation_log (tenant_id);
CREATE INDEX IF NOT EXISTS memory_federation_log_operation_idx
  ON memory_federation_log (operation);

ALTER TABLE memory_federation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_federation_log_tenant_policy"
  ON memory_federation_log
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─── self_healing_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS self_healing_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id      text NOT NULL,
  healing_type          text NOT NULL,
  tenant_id             uuid,
  recovery_attempts     int DEFAULT 0,
  circuits_tripped      int DEFAULT 0,
  corrections_applied   int DEFAULT 0,
  converged             boolean DEFAULT false,
  duration_ms           numeric,
  recorded_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS self_healing_events_orchestration_id_idx
  ON self_healing_events (orchestration_id);
CREATE INDEX IF NOT EXISTS self_healing_events_tenant_id_idx
  ON self_healing_events (tenant_id);
CREATE INDEX IF NOT EXISTS self_healing_events_healing_type_idx
  ON self_healing_events (healing_type);
CREATE INDEX IF NOT EXISTS self_healing_events_converged_idx
  ON self_healing_events (converged);

ALTER TABLE self_healing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self_healing_events_tenant_policy"
  ON self_healing_events
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─── execution_economics_log ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution_economics_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id          text NOT NULL,
  workflow_type         text NOT NULL,
  tenant_id             uuid,
  estimated_cost_usd    numeric,
  efficiency_score      numeric,
  compute_units         numeric,
  memory_mb             numeric,
  duration_ms           numeric,
  recorded_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS execution_economics_log_execution_id_idx
  ON execution_economics_log (execution_id);
CREATE INDEX IF NOT EXISTS execution_economics_log_workflow_type_idx
  ON execution_economics_log (workflow_type);
CREATE INDEX IF NOT EXISTS execution_economics_log_tenant_id_idx
  ON execution_economics_log (tenant_id);
CREATE INDEX IF NOT EXISTS execution_economics_log_recorded_at_idx
  ON execution_economics_log (recorded_at);

ALTER TABLE execution_economics_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_economics_log_tenant_policy"
  ON execution_economics_log
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─── federation_governance_log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS federation_governance_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id   text NOT NULL,
  event_type       text NOT NULL,
  tenant_id        uuid,
  trust_score      numeric,
  abuse_detected   boolean DEFAULT false,
  rollback_issued  boolean DEFAULT false,
  payload_signed   boolean DEFAULT true,
  recorded_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS federation_governance_log_participant_id_idx
  ON federation_governance_log (participant_id);
CREATE INDEX IF NOT EXISTS federation_governance_log_tenant_id_idx
  ON federation_governance_log (tenant_id);
CREATE INDEX IF NOT EXISTS federation_governance_log_event_type_idx
  ON federation_governance_log (event_type);
CREATE INDEX IF NOT EXISTS federation_governance_log_abuse_detected_idx
  ON federation_governance_log (abuse_detected);

ALTER TABLE federation_governance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "federation_governance_log_tenant_policy"
  ON federation_governance_log
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─── distributed_scale_events ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS distributed_scale_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem            text NOT NULL,
  event_type           text NOT NULL,
  tenant_id            uuid,
  current_scale        numeric,
  target_scale         numeric,
  action               text,
  throughput_per_min   numeric,
  backpressure_active  boolean DEFAULT false,
  recorded_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS distributed_scale_events_subsystem_idx
  ON distributed_scale_events (subsystem);
CREATE INDEX IF NOT EXISTS distributed_scale_events_tenant_id_idx
  ON distributed_scale_events (tenant_id);
CREATE INDEX IF NOT EXISTS distributed_scale_events_event_type_idx
  ON distributed_scale_events (event_type);
CREATE INDEX IF NOT EXISTS distributed_scale_events_recorded_at_idx
  ON distributed_scale_events (recorded_at);

ALTER TABLE distributed_scale_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "distributed_scale_events_tenant_policy"
  ON distributed_scale_events
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─── Realtime: self_healing_events ───────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE self_healing_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Realtime: federation_governance_log ─────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE federation_governance_log;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
