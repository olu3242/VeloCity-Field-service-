-- Migration 012: Neural Runtime — Neural Execution Graph, Workflow Evolution,
--                Orchestration Mutations, Cognition Lineage, Autonomous Audit,
--                Intelligence Mesh Exchanges
-- ADDITIVE ONLY — no drops, no alters to existing tables

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. neural_execution_graph
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS neural_execution_graph (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type         text        NOT NULL,
  label             text        NOT NULL,
  tenant_id         uuid,
  activation_count  int                  DEFAULT 0,
  embedding_signal  numeric              DEFAULT 0.5,
  created_at        timestamptz          DEFAULT now(),
  last_activated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_neg_tenant_id  ON neural_execution_graph (tenant_id);
CREATE INDEX IF NOT EXISTS idx_neg_node_type  ON neural_execution_graph (node_type);

ALTER TABLE neural_execution_graph ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS neural_execution_graph_tenant_policy ON neural_execution_graph;
CREATE POLICY neural_execution_graph_tenant_policy
  ON neural_execution_graph
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. workflow_evolution_cycles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_evolution_cycles (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type        text        NOT NULL,
  tenant_id            uuid,
  from_generation      int         NOT NULL,
  to_generation        int         NOT NULL,
  mutations_applied    int                  DEFAULT 0,
  adaptations_applied  int                  DEFAULT 0,
  fitness_improvement  numeric              DEFAULT 0,
  status               text        NOT NULL DEFAULT 'running',
  started_at           timestamptz          DEFAULT now(),
  completed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wec_tenant_id     ON workflow_evolution_cycles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wec_workflow_type ON workflow_evolution_cycles (workflow_type);
CREATE INDEX IF NOT EXISTS idx_wec_status        ON workflow_evolution_cycles (status);

ALTER TABLE workflow_evolution_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_evolution_cycles_tenant_policy ON workflow_evolution_cycles;
CREATE POLICY workflow_evolution_cycles_tenant_policy
  ON workflow_evolution_cycles
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. orchestration_mutations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orchestration_mutations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type  text        NOT NULL,
  generation_id  text,
  tenant_id      uuid,
  mutation_type  text        NOT NULL,
  description    text        NOT NULL,
  safety_score   numeric              DEFAULT 0,
  replay_safe    boolean              DEFAULT true,
  status         text        NOT NULL DEFAULT 'proposed',
  proposed_at    timestamptz          DEFAULT now(),
  applied_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_om_tenant_id     ON orchestration_mutations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_om_workflow_type ON orchestration_mutations (workflow_type);
CREATE INDEX IF NOT EXISTS idx_om_mutation_type ON orchestration_mutations (mutation_type);
CREATE INDEX IF NOT EXISTS idx_om_status        ON orchestration_mutations (status);

ALTER TABLE orchestration_mutations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orchestration_mutations_tenant_policy ON orchestration_mutations;
CREATE POLICY orchestration_mutations_tenant_policy
  ON orchestration_mutations
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cognition_lineage
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cognition_lineage (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_lineage_id uuid,
  domain            text        NOT NULL,
  tenant_id         uuid,
  reasoning_ids     text[]               DEFAULT '{}',
  depth             int                  DEFAULT 1,
  conclusion        text,
  confidence        numeric              DEFAULT 0,
  created_at        timestamptz          DEFAULT now(),
  closed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cl_tenant_id ON cognition_lineage (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cl_domain    ON cognition_lineage (domain);
CREATE INDEX IF NOT EXISTS idx_cl_closed_at ON cognition_lineage (closed_at);

ALTER TABLE cognition_lineage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cognition_lineage_tenant_policy ON cognition_lineage;
CREATE POLICY cognition_lineage_tenant_policy
  ON cognition_lineage
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. autonomous_actions_audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomous_actions_audit (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type          text        NOT NULL,
  entity_id            text        NOT NULL,
  entity_type          text        NOT NULL,
  tenant_id            uuid,
  autonomy_mode        text,
  decision             jsonb                DEFAULT '{}'::jsonb,
  outcome              text,
  rolled_back          boolean              DEFAULT false,
  governance_approved  boolean              DEFAULT false,
  executed_at          timestamptz          DEFAULT now(),
  resolved_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_aaa_tenant_id    ON autonomous_actions_audit (tenant_id);
CREATE INDEX IF NOT EXISTS idx_aaa_action_type  ON autonomous_actions_audit (action_type);
CREATE INDEX IF NOT EXISTS idx_aaa_entity_type  ON autonomous_actions_audit (entity_type);
CREATE INDEX IF NOT EXISTS idx_aaa_executed_at  ON autonomous_actions_audit (executed_at);

ALTER TABLE autonomous_actions_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS autonomous_actions_audit_tenant_policy ON autonomous_actions_audit;
CREATE POLICY autonomous_actions_audit_tenant_policy
  ON autonomous_actions_audit
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. intelligence_mesh_exchanges
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_mesh_exchanges (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id    text        NOT NULL,
  exchange_type    text        NOT NULL,
  source_cloud_id  text        NOT NULL,
  target_cloud_id  text,
  payload_summary  text,
  trust_required   text                 DEFAULT 'medium',
  status           text                 DEFAULT 'pending',
  initiated_at     timestamptz          DEFAULT now(),
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ime_federation_id  ON intelligence_mesh_exchanges (federation_id);
CREATE INDEX IF NOT EXISTS idx_ime_status         ON intelligence_mesh_exchanges (status);
CREATE INDEX IF NOT EXISTS idx_ime_exchange_type  ON intelligence_mesh_exchanges (exchange_type);

ALTER TABLE intelligence_mesh_exchanges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intelligence_mesh_exchanges_tenant_policy ON intelligence_mesh_exchanges;
CREATE POLICY intelligence_mesh_exchanges_tenant_policy
  ON intelligence_mesh_exchanges
  FOR ALL
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Realtime publications
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE autonomous_actions_audit;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE intelligence_mesh_exchanges;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
