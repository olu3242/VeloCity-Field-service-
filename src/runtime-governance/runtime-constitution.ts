import { logger } from "@/runtime-core/observability"

export type ConstitutionPrinciple =
  | "tenant_isolation"
  | "data_residency"
  | "audit_completeness"
  | "idempotency_guarantee"
  | "retry_safety"
  | "zero_trust_execution"
  | "deterministic_replay"
  | "federation_safety"
  | "ai_explainability"
  | "circuit_breaker_compliance"

export interface ConstitutionArticle {
  articleId: string
  principle: ConstitutionPrinciple
  title: string
  description: string
  enforcementLevel: "advisory" | "required" | "mandatory"
  autoEnforceable: boolean
  violationAction: "log" | "warn" | "block" | "emergency_stop"
  activeSince: string
}

const CONSTITUTION: Map<ConstitutionPrinciple, ConstitutionArticle> = new Map()

const PRINCIPLE_DEFINITIONS: Array<[ConstitutionPrinciple, string, string]> = [
  ["tenant_isolation", "Tenant Isolation", "All tenant data and execution contexts must be strictly isolated."],
  ["data_residency", "Data Residency", "Data must remain within declared residency boundaries at all times."],
  ["audit_completeness", "Audit Completeness", "Every mutable operation must produce a complete audit trail."],
  ["idempotency_guarantee", "Idempotency Guarantee", "All operations must be safe to retry without side effects."],
  ["retry_safety", "Retry Safety", "Retry logic must not cause duplicate side effects or data corruption."],
  ["zero_trust_execution", "Zero Trust Execution", "No execution context is trusted by default; all must be verified."],
  ["deterministic_replay", "Deterministic Replay", "Workflows must produce identical results when replayed with same inputs."],
  ["federation_safety", "Federation Safety", "Cross-tenant federation must respect isolation and permission boundaries."],
  ["ai_explainability", "AI Explainability", "AI decisions must be explainable and traceable to source reasoning."],
  ["circuit_breaker_compliance", "Circuit Breaker Compliance", "All integrations must honor circuit breaker state and backoff."],
]

for (const [principle, title, description] of PRINCIPLE_DEFINITIONS) {
  const article: ConstitutionArticle = {
    articleId: crypto.randomUUID(),
    principle,
    title,
    description,
    enforcementLevel: "mandatory",
    autoEnforceable: true,
    violationAction: "block",
    activeSince: new Date().toISOString(),
  }
  CONSTITUTION.set(principle, article)
}

logger.info("Runtime constitution initialized", "runtime-constitution", {
  metadata: { articleCount: CONSTITUTION.size },
})

export function getArticle(principle: ConstitutionPrinciple): ConstitutionArticle | undefined {
  return CONSTITUTION.get(principle)
}

export function getConstitution(): ConstitutionArticle[] {
  return Array.from(CONSTITUTION.values())
}

export function getEnforcementLevel(
  principle: ConstitutionPrinciple
): ConstitutionArticle["enforcementLevel"] | undefined {
  return CONSTITUTION.get(principle)?.enforcementLevel
}

export function getConstitutionSummary(): {
  total: number
  mandatory: number
  autoEnforceable: number
} {
  let mandatory = 0
  let autoEnforceable = 0
  for (const article of Array.from(CONSTITUTION.values())) {
    if (article.enforcementLevel === "mandatory") mandatory++
    if (article.autoEnforceable) autoEnforceable++
  }
  return { total: CONSTITUTION.size, mandatory, autoEnforceable }
}
