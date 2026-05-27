/**
 * VeloCity Runtime — Central AI Execution Dispatcher
 *
 * Single entry-point for all agent invocations.
 * Enforces registry checks, context hydration, tracing, and error handling.
 */

import type { AgentName, AgentContext } from "@/lib/contracts/agents";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { runAgent } from "@/lib/agents/runAgent";
import { hydrateContext } from "./context";
import { createTrace, recordTrace } from "./tracing";

// ── Public types ──────────────────────────────────────────────────────────

export interface DispatchOptions {
  /** Skip Supabase context enrichment (faster, less context) */
  skipContextHydration?: boolean;
  /** Caller-supplied trace ID — if omitted, one is generated */
  traceId?: string;
  /** Allow execution even if agent status is not "active" */
  governanceOverride?: boolean;
}

export interface ExecutionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  traceId: string;
  agentId: string;
  latencyMs: number;
  tokensUsed: number;
  hydrated: boolean;
}

// ── Dispatcher ────────────────────────────────────────────────────────────

export async function dispatchAgent<T = Record<string, unknown>>(
  name: AgentName,
  prompt: string,
  baseContext: AgentContext,
  options: DispatchOptions = {}
): Promise<ExecutionResult<T>> {
  const registration = AGENT_REGISTRY[name];
  const agentId = registration.agent_id;

  // ── Registry status check ─────────────────────────────────────────────
  if (registration.status !== "active" && !options.governanceOverride) {
    return {
      success: false,
      error: `Agent ${name} is not active (status: ${registration.status}). Use governanceOverride to force.`,
      traceId: options.traceId ?? `trc_skipped_${Date.now().toString(36)}`,
      agentId,
      latencyMs: 0,
      tokensUsed: 0,
      hydrated: false,
    };
  }

  // ── Context hydration ─────────────────────────────────────────────────
  const skipHydration = options.skipContextHydration ?? false;
  let hydratedCtx: AgentContext = baseContext;
  let hydrated = false;

  if (!skipHydration) {
    const enriched = await hydrateContext(name, {
      jobId: baseContext.jobId,
      tenantId: baseContext.tenantId,
      userId: baseContext.userId,
    });
    hydratedCtx = enriched;
    hydrated = enriched.enriched ?? false;
  }

  // Propagate / assign traceId
  const trace = createTrace(
    name,
    baseContext.tenantId ?? "unknown",
    baseContext.jobId
  );
  const activeTraceId = options.traceId ?? trace.traceId;
  hydratedCtx = { ...hydratedCtx, traceId: activeTraceId };

  // ── Agent execution ───────────────────────────────────────────────────
  const start = Date.now();
  let result: ExecutionResult<T>;

  try {
    const agentResult = await runAgent<T>(name, {
      prompt,
      ...hydratedCtx,
    });

    result = {
      success: agentResult.success,
      data: agentResult.data,
      error: agentResult.error,
      traceId: activeTraceId,
      agentId,
      latencyMs: agentResult.latencyMs ?? Date.now() - start,
      tokensUsed: agentResult.tokensUsed ?? 0,
      hydrated,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result = {
      success: false,
      error: errorMsg,
      traceId: activeTraceId,
      agentId,
      latencyMs: Date.now() - start,
      tokensUsed: 0,
      hydrated,
    };
  }

  // ── Record trace (non-blocking) ───────────────────────────────────────
  const traceHandle = { ...trace, traceId: activeTraceId };
  void recordTrace(traceHandle, result as ExecutionResult<unknown>);

  return result;
}
