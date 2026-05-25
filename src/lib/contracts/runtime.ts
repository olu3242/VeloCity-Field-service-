/**
 * VeloCity Contracts — Runtime Configuration & Health Types
 *
 * Shared type definitions for the automation runtime: worker configuration,
 * heartbeat records, queue health summaries, and platform health snapshots.
 *
 * Used by: admin automation page, health API, monitoring systems.
 */

// ── Worker runtime config ─────────────────────────────────────────────────────

/**
 * Tunable parameters for the automation queue worker.
 * Override the defaults by passing a partial config to processAutomationQueue().
 */
export interface RuntimeConfig {
  /** Maximum retry attempts before an item is permanently failed */
  max_retries: number;

  /** Base backoff delay in ms (multiplied by retry_count for exponential backoff) */
  retry_backoff_ms: number;

  /** Maximum wall-clock time (ms) before a worker invocation aborts */
  worker_timeout_ms: number;

  /** How often (ms) the polling worker checks for new queue items */
  queue_poll_interval_ms: number;

  /** How often (ms) the SLA checker looks for breached jobs */
  sla_check_interval_ms: number;
}

/**
 * Default runtime configuration values.
 * Matches the current hard-coded behaviour in worker.ts.
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  max_retries: 3,
  retry_backoff_ms: 1_000,
  worker_timeout_ms: 30_000,
  queue_poll_interval_ms: 5_000,
  sla_check_interval_ms: 60_000,
};

// ── Worker heartbeat ──────────────────────────────────────────────────────────

/**
 * Periodic status report from a running worker instance.
 * Useful for detecting stalled workers in a multi-process setup.
 */
export interface WorkerHeartbeat {
  /** Unique identifier for this worker instance */
  worker_id: string;

  /** ISO 8601 timestamp of the most recent heartbeat */
  last_seen: string;

  /** Total jobs processed in this worker's lifetime */
  jobs_processed: number;

  /** Total jobs that failed (exhausted all retries) */
  jobs_failed: number;

  /** Current number of pending items in the queue */
  queue_depth: number;
}

// ── Queue health ──────────────────────────────────────────────────────────────

/**
 * A snapshot of the automation_queue table's current state.
 * Returned as part of PlatformHealth.
 */
export interface QueueHealth {
  /** Total items currently in the queue (all statuses) */
  total: number;

  /** Items awaiting processing */
  pending: number;

  /** Items currently being processed by a worker */
  processing: number;

  /** Items that have been successfully processed */
  completed: number;

  /** Items that have permanently failed (exhausted all retries) */
  failed: number;

  /**
   * Age in ms of the oldest pending item.
   * High values indicate the worker is not keeping up.
   * Null if there are no pending items.
   */
  oldest_pending_age_ms: number | null;
}

// ── Platform health snapshot ──────────────────────────────────────────────────

/**
 * Current health status of the VeloCity platform's runtime systems.
 * Returned by getPlatformHealth() in contracts/health.ts.
 * Displayed in the admin automation page.
 */
export interface PlatformHealth {
  /** Health of the automation event engine (emitEvent → queue → worker) */
  automation_engine: "healthy" | "degraded" | "down";

  /**
   * Health of the AI agent runtime (Anthropic API reachability).
   * Currently always "healthy" — Anthropic liveness check is a P2 improvement.
   */
  ai_runtime: "healthy" | "degraded" | "down";

  /** Health of the Stripe payment integration */
  stripe: "healthy" | "degraded" | "down";

  /** Detailed queue state snapshot */
  queue: QueueHealth;

  /**
   * ISO 8601 timestamp of the most recently completed automation run.
   * Null if no runs have completed yet.
   */
  last_processed_at: string | null;

  /** ISO 8601 timestamp when this health snapshot was generated */
  timestamp: string;
}
