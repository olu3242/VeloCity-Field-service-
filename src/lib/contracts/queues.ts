/**
 * VeloCity Contracts — Queue Types
 *
 * Canonical type definitions for the automation queue, worker, and run records.
 * Matches the automation_queue and automation_runs table schemas.
 *
 * The queue is currently Supabase-backed (Postgres polling).
 * These contracts are abstracted so BullMQ/Redis can be substituted
 * in Wave 3 without changing consumer code.
 */

import type { AutomationEventType } from "./events";

// ── Queue item status ──────────────────────────────────────────────────────

/**
 * Lifecycle status of a queue item.
 * Matches the status values in the automation_queue table.
 */
export type QueueStatus =
  | "pending"     // Waiting to be picked up by the worker
  | "processing"  // Currently being processed (claimed by a worker)
  | "completed"   // Successfully processed
  | "failed"      // Exhausted all retries
  | "skipped";    // Intentionally skipped (e.g., duplicate detected)

// ── Queue item (matches automation_queue DB row) ───────────────────────────

/**
 * A single item in the automation processing queue.
 * Matches the automation_queue table schema.
 */
export interface QueueItem {
  /** UUID primary key */
  id: string;

  /** Reference to the originating automation_events row */
  event_id: string | null;

  /** The event type — used by the router to select the handler */
  event_type: AutomationEventType;

  /** Event payload passed to the handler */
  payload: Record<string, unknown>;

  /** Current processing status */
  status: QueueStatus;

  /** Number of processing attempts made so far */
  retry_count: number;

  /**
   * Maximum number of retries before the item is marked failed.
   * Defaults to 3 in the current worker implementation.
   * Should be configurable per event type in a future wave.
   */
  max_retries: number;

  /** Tenant ID for multi-tenant isolation */
  tenant_id: string | null;

  /**
   * Idempotency key — prevents duplicate processing of the same logical event.
   * Matches the dedup_key in automation_events.
   */
  dedup_key: string | null;

  /** Human-readable error from the last failed attempt */
  error_message: string | null;

  /**
   * Earliest time this item can be picked up by the worker.
   * Set to future timestamps for retry backoff.
   * ISO 8601 string.
   */
  available_at: string;

  /** ISO 8601 timestamp when this item was created */
  created_at: string;

  /** ISO 8601 timestamp when this item was last processed */
  processed_at: string | null;
}

// ── Run record (matches automation_runs DB row) ────────────────────────────

/**
 * Status of a single automation worker run.
 * Matches the automation_runs table schema.
 */
export type RunStatus = "processing" | "completed" | "failed" | "skipped";

/**
 * A single execution record for a queue item.
 * One QueueItem can produce multiple AutomationRun records (one per attempt).
 * Matches the automation_runs table schema.
 */
export interface AutomationRun {
  /** UUID primary key */
  id: string;

  /** Reference to the automation_queue row */
  queue_id: string | null;

  /** Reference to the automation_events row */
  event_id: string | null;

  /** Event type processed in this run */
  event_type: AutomationEventType;

  /** Tenant ID */
  tenant_id: string | null;

  /** Current status of this run */
  status: RunStatus;

  /**
   * Actions taken during this run.
   * Example: ["ALICE.intake_review", "MAX.dispatch_review"]
   */
  actions: string[] | null;

  /** Structured output from the handler/agents */
  output: Record<string, unknown> | null;

  /** Error message if status is "failed" */
  error_message: string | null;

  /** ISO 8601 timestamp when this run started */
  started_at: string;

  /** ISO 8601 timestamp when this run completed (null if still running) */
  completed_at: string | null;
}

// ── Worker configuration ───────────────────────────────────────────────────

/**
 * Configuration for the automation queue worker.
 * Passed to processAutomationQueue() in worker.ts.
 */
export interface WorkerConfig {
  /**
   * Maximum number of queue items to process in a single invocation.
   * Keep this low (10-25) to stay within serverless function time limits.
   * @default 10
   */
  limit: number;

  /**
   * If set, only process items for this tenant.
   * Omit for global processing (admin/cron context).
   */
  tenantId?: string;

  /**
   * Maximum wall-clock time (ms) before the worker aborts processing.
   * Prevents serverless timeout errors.
   * @default 25000 (25 seconds)
   */
  timeoutMs?: number;
}

/**
 * Result returned by processAutomationQueue().
 * Provides a summary of the processing batch.
 */
export interface WorkerResult {
  /** Total items fetched from the queue */
  processed: number;

  /** Items successfully completed (status → "completed") */
  completed: number;

  /** Alias for completed (backward compatible) */
  succeeded: number;

  /** Items that threw an error during processing */
  failed: number;

  /** Items skipped (e.g., limit not reached) */
  skipped: number;

  /** Details of each failed item */
  errors: Array<{ queueId: string; message: string }>;
}

// ── Emit result ────────────────────────────────────────────────────────────

/**
 * Result returned by emitEvent().
 * Indicates whether the event was successfully queued.
 */
export interface EmitResult {
  /** The ID of the created automation_events row */
  eventId?: string;

  /** True if the event was inserted into automation_queue */
  queued: boolean;

  /** True if this event was a duplicate (dedup_key matched an existing event) */
  duplicate?: boolean;

  /** Error message if queuing failed */
  error?: string;
}
