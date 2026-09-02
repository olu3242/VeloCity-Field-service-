-- Enterprise Intelligence Layer: persistent memory store

CREATE TABLE IF NOT EXISTS enterprise_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  category text NOT NULL,
  entity_type text,
  entity_id text,
  actor_type text DEFAULT 'system',
  actor_id text,
  summary text NOT NULL,
  detail jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  importance text DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enterprise_memory_tenant_cat ON enterprise_memory(tenant_id, category);
CREATE INDEX IF NOT EXISTS enterprise_memory_entity ON enterprise_memory(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS enterprise_memory_created ON enterprise_memory(tenant_id, created_at DESC);

ALTER TABLE enterprise_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_enterprise_memory" ON enterprise_memory
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.tenant_id = enterprise_memory.tenant_id
    )
  );

CREATE POLICY "service_role_full_enterprise_memory" ON enterprise_memory
  FOR ALL USING (auth.role() = 'service_role');
