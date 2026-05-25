/**
 * VeloCity Runtime — AI Barrel Export
 *
 * Re-exports all public symbols from the runtime/ai layer.
 * Import from "@/lib/runtime/ai" to access context hydration,
 * the dispatcher, and tracing primitives.
 */

// Context hydration
export type {
  ProviderHistory,
  CustomerHistory,
  JobContext,
  QueueState,
  HydratedContext,
  BaseContextInput,
} from "./context";
export { hydrateContext } from "./context";

// Central dispatcher
export type { DispatchOptions, ExecutionResult } from "./dispatcher";
export { dispatchAgent } from "./dispatcher";

// Execution tracing
export type { TraceRecord, TraceHandle } from "./tracing";
export { createTrace, recordTrace } from "./tracing";
