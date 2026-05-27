/**
 * VeloCity Runtime — Execution Tracing
 *
 * Lightweight tracing primitives that write structured records to agent_logs.
 * Designed to be non-blocking: recordTrace swallows all errors.
 */

import type { AgentName } from "@/lib/contracts/agents";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ExecutionResult } from "./dispatcher";

// ── Types ─────────────────────────────────────────────────────────────────

export interface TraceRecord {
  traceId: string;
  agentName: AgentName;
  tenantId: string;
  jobId?: string;
  startedAt: string;
  finishedAt?: string;
  latencyMs?: number;
  tokensUsed?: number;
  success?: boolean;
  error?: string;
}

export interface TraceHandle {
  traceId: string;
  startedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 9);
  return `trc_${timestamp}_${random}`;
}

// ── Exported functions ────────────────────────────────────────────────────

/**
 * Create a new trace handle. Pure — no I/O.
 * Call this before invoking the agent.
 */
export function createTrace(
  agentName: AgentName,
  tenantId: string,
  jobId?: string
): TraceHandle & { agentName: AgentName; tenantId: string; jobId?: string } {
  return {
    traceId: generateTraceId(),
    startedAt: new Date().toISOString(),
    agentName,
    tenantId,
    jobId,
  };
}

/**
 * Persist trace metadata to agent_logs after execution.
 * Non-blocking — all errors are swallowed.
 */
export async function recordTrace(
  trace: ReturnType<typeof createTrace>,
  result: ExecutionResult<unknown>
): Promise<void> {
  try {
    const supabase = getAdminClient();
    const finishedAt = new Date().toISOString();

    await supabase.from("agent_logs").insert({
      agent_name: trace.agentName,
      tenant_id: trace.tenantId,
      job_id: trace.jobId ?? null,
      user_id: null,
      action: `trace:${trace.agentName.toLowerCase()}`,
      input: { traceId: trace.traceId, startedAt: trace.startedAt },
      output: {
        success: result.success,
        agentId: result.agentId,
        hydrated: result.hydrated,
        finishedAt,
      },
      tokens_used: result.tokensUsed > 0 ? result.tokensUsed : null,
      latency_ms: result.latencyMs > 0 ? result.latencyMs : null,
      error: result.error ?? null,
      trace_id: trace.traceId,
    });
  } catch {
    // non-blocking — tracing must never break the happy path
  }
}
