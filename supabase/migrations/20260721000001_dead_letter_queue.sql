-- Dead letter queue for automation events that exhausted retries.
-- Rows arrive here when an automation_queue item has been retried the maximum
-- number of times and still fails. Admins and super_admins can inspect and
-- resolve dead letters via the ops dashboard; service_role writes them from
-- the queue worker.

CREATE TABLE IF NOT EXISTS automation_dead_letters (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        text        NOT NULL,
  original_queue_id uuid,
  event_type       text        NOT NULL,
  payload          jsonb       NOT NULL DEFAULT '{}',
  error_message    text,
  retry_count      integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_note  text
);

-- Fast lookup by tenant for the ops dashboard
CREATE INDEX IF NOT EXISTS idx_dead_letters_tenant
  ON automation_dead_letters (tenant_id);

-- Partial index for unresolved items — the common query path
CREATE INDEX IF NOT EXISTS idx_dead_letters_unresolved
  ON automation_dead_letters (tenant_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- Optional lookup by original queue item
CREATE INDEX IF NOT EXISTS idx_dead_letters_queue_id
  ON automation_dead_letters (original_queue_id)
  WHERE original_queue_id IS NOT NULL;

ALTER TABLE automation_dead_letters ENABLE ROW LEVEL SECURITY;

-- Admins and super_admins can read and update dead letters for their tenant
CREATE POLICY "admins_manage_dead_letters"
  ON automation_dead_letters
  FOR ALL
  TO authenticated
  USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'super_admin'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'super_admin'
  );

-- Service role (used by the queue worker) has unrestricted access
CREATE POLICY "service_role_dead_letters"
  ON automation_dead_letters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
