/**
 * VeloCity Feature Flag Registry
 *
 * Simple compile-time flag registry that reads from environment variables.
 * No external dependency — just process.env checks evaluated at module load.
 *
 * Post-MVP autonomous/network features default to OFF; set the corresponding
 * NEXT_PUBLIC_FF_* environment variable to "true" to enable in a given
 * deployment. MVP features default to ON; set to "false" to disable.
 *
 * All NEXT_PUBLIC_FF_* vars are safe to bundle in client-side code.
 * Server-only feature decisions should live in the API layer.
 */

export const FEATURE_FLAGS = {
  // ── Post-MVP autonomous operations — compiled in but disabled by default ──

  /** Neural runtime layer for adaptive model selection (post-MVP). */
  NEURAL_RUNTIME: process.env.NEXT_PUBLIC_FF_NEURAL_RUNTIME === "true",

  /** Multi-tenant federation network for cross-franchise intelligence (post-MVP). */
  FEDERATION_NETWORK: process.env.NEXT_PUBLIC_FF_FEDERATION === "true",

  /** Swarm coordination layer for distributed agent consensus (post-MVP). */
  SWARM_COORDINATION: process.env.NEXT_PUBLIC_FF_SWARM === "true",

  /** Autonomous evolution cycles — self-modifying agent policies (post-MVP). */
  EVOLUTION_CYCLES: process.env.NEXT_PUBLIC_FF_EVOLUTION === "true",

  /** Autonomous incident remediation without human approval (post-MVP). */
  AUTONOMOUS_REMEDIATION: process.env.NEXT_PUBLIC_FF_AUTO_REMEDIATION === "true",

  /** Cross-tenant shared memory federation (post-MVP). */
  MEMORY_FEDERATION: process.env.NEXT_PUBLIC_FF_MEMORY_FEDERATION === "true",

  /** Elastic infrastructure scaling APIs (post-MVP). */
  ELASTIC_SCALE: process.env.NEXT_PUBLIC_FF_ELASTIC_SCALE === "true",

  // ── MVP features — enabled by default ────────────────────────────────────

  /** AI agent pipeline (ALICE → MAX → QUINN → NOVA → REX etc.) */
  AI_AGENTS: process.env.NEXT_PUBLIC_FF_AI_AGENTS !== "false",

  /** Enterprise intelligence dashboards and executive summaries. */
  ENTERPRISE_INTELLIGENCE: process.env.NEXT_PUBLIC_FF_ENTERPRISE_INTEL !== "false",

  /** Digital twin live-snapshot view for admin ops. */
  DIGITAL_TWIN: process.env.NEXT_PUBLIC_FF_DIGITAL_TWIN !== "false",

  /** Knowledge graph entity-relationship views. */
  KNOWLEDGE_GRAPH: process.env.NEXT_PUBLIC_FF_KNOWLEDGE_GRAPH !== "false",
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Check whether a feature flag is enabled.
 *
 * ```ts
 * if (isEnabled("AI_AGENTS")) {
 *   await runAgent("ALICE", context);
 * }
 * ```
 */
export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
