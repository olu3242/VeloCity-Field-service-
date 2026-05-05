-- ============================================================
-- VeloCity Automation Engine — Migration 002
-- ============================================================

-- Event log: immutable record of every system event
CREATE TABLE IF NOT EXISTS automation_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL DEFAULT '{}',
  dedup_key     TEXT        UNIQUE,
  status        TEXT        NOT NULL DEFAULT 'received'
                            CHECK (status IN ('received','processing','completed','failed')),
  retry_count   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auto_events_type       ON automation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_auto_events_status     ON automation_events(status);
CREATE INDEX IF NOT EXISTS idx_auto_events_created_at ON automation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_events_dedup      ON automation_events(dedup_key) WHERE dedup_key IS NOT NULL;

-- Work queue: retryable unit of work derived from events
CREATE TABLE IF NOT EXISTS automation_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        REFERENCES automation_events(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','completed','failed','skipped')),
  retry_count   INTEGER     NOT NULL DEFAULT 0,
  max_retries   INTEGER     NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedup_key     TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auto_queue_status       ON automation_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_auto_queue_event_type   ON automation_queue(event_type);
CREATE INDEX IF NOT EXISTS idx_auto_queue_created_at   ON automation_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_queue_dedup        ON automation_queue(dedup_key) WHERE dedup_key IS NOT NULL;

-- Execution history: every handler run with timing + output
CREATE TABLE IF NOT EXISTS automation_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id      UUID        REFERENCES automation_queue(id) ON DELETE SET NULL,
  event_type    TEXT        NOT NULL,
  handler       TEXT        NOT NULL,
  input         JSONB       NOT NULL DEFAULT '{}',
  output        JSONB,
  status        TEXT        NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running','completed','failed','skipped')),
  duration_ms   INTEGER,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auto_runs_event_type ON automation_runs(event_type);
CREATE INDEX IF NOT EXISTS idx_auto_runs_status     ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_auto_runs_created_at ON automation_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_runs_queue_id   ON automation_runs(queue_id);

-- Configurable rules: enable/disable/tune automation behaviour
CREATE TABLE IF NOT EXISTS automation_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT        NOT NULL,
  rule_name   TEXT        NOT NULL,
  condition   JSONB       NOT NULL DEFAULT '{}',
  action      JSONB       NOT NULL DEFAULT '{}',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  priority    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_rules_event_type ON automation_rules(event_type, is_active);

-- SLA configuration table
CREATE TABLE IF NOT EXISTS sla_configs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type           TEXT        NOT NULL UNIQUE,
  warn_after_minutes   INTEGER     NOT NULL DEFAULT 30,
  breach_after_minutes INTEGER     NOT NULL DEFAULT 60,
  escalate_after_minutes INTEGER   NOT NULL DEFAULT 120,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-load default SLA configs
INSERT INTO sla_configs (event_type, warn_after_minutes, breach_after_minutes, escalate_after_minutes) VALUES
  ('offer_sent',          8,   15,  30),
  ('accepted',           30,   60, 120),
  ('quote_submitted',    15,   30,  60),
  ('awaiting_quote_approval', 60, 120, 240),
  ('in_progress',       120,  240, 480),
  ('completed_pending_confirmation', 60, 120, 180)
ON CONFLICT (event_type) DO NOTHING;

-- Payout queue: jobs awaiting financial release
CREATE TABLE IF NOT EXISTS payout_queue (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provider_id       UUID        NOT NULL REFERENCES providers(id),
  amount_cents      INTEGER     NOT NULL,
  platform_fee_cents INTEGER    NOT NULL,
  net_payout_cents  INTEGER     NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'queued'
                                CHECK (status IN ('queued','processing','released','failed','held')),
  hold_reason       TEXT,
  release_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts          INTEGER     NOT NULL DEFAULT 0,
  stripe_transfer_id TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_queue_status      ON payout_queue(status, release_after);
CREATE INDEX IF NOT EXISTS idx_payout_queue_job_id      ON payout_queue(job_id);
CREATE INDEX IF NOT EXISTS idx_payout_queue_provider_id ON payout_queue(provider_id);

-- Audit log: governance trail for every significant action
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type  TEXT        NOT NULL CHECK (actor_type IN ('user','agent','system','cron')),
  actor_id    TEXT,
  action      TEXT        NOT NULL,
  resource    TEXT        NOT NULL,
  resource_id TEXT,
  payload     JSONB       NOT NULL DEFAULT '{}',
  result      TEXT,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs(created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_queue      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;

-- Only service_role (admin) can read/write automation tables
CREATE POLICY "service_role_only_events" ON automation_events
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only_queue" ON automation_queue
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only_runs" ON automation_runs
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only_rules" ON automation_rules
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only_payouts" ON payout_queue
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only_audit" ON audit_logs
  USING (auth.role() = 'service_role');

-- updated_at trigger for automation_rules
CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_automation_rules_updated_at();
