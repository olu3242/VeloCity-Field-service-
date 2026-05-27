import { getOperatorState } from "@/lib/governance/operator"
import { getAllCircuits } from "@/lib/governance/circuit-breaker"

export interface OperatorQuery {
  id: string
  queryText: string
  operatorId: string
  tenantId?: string
  intent: "status" | "diagnostic" | "action" | "forecast" | "history"
  parsedEntities: { type: string; value: string }[]
  response: string
  confidence: number
  processedAt: string
}

const QUERIES: OperatorQuery[] = []
const CAP = 500
const KNOWN_AGENTS = ["IVY", "FINN", "GABRIEL", "MAX", "HERALD", "ARIA", "ALICE", "QUINN", "NOVA", "REX", "LENA", "TESS"]

function detectIntent(text: string): OperatorQuery["intent"] {
  const lower = text.toLowerCase()
  if (/status|health/.test(lower)) return "status"
  if (/why|failed|error/.test(lower)) return "diagnostic"
  if (/scale|restart|pause/.test(lower)) return "action"
  if (/predict|forecast/.test(lower)) return "forecast"
  return "history"
}

function parseEntities(text: string): { type: string; value: string }[] {
  const entities: { type: string; value: string }[] = []
  const capitalizedWords = text.match(/\b[A-Z][A-Z]+\b/g) ?? []
  for (const word of capitalizedWords) {
    if (KNOWN_AGENTS.includes(word)) {
      entities.push({ type: "agent", value: word })
    } else {
      entities.push({ type: "entity", value: word })
    }
  }
  return entities
}

function buildResponse(intent: OperatorQuery["intent"]): string {
  const state = getOperatorState()
  const circuits = getAllCircuits()
  const openCircuits = circuits.filter(c => c.state === "open").length
  switch (intent) {
    case "status":
      return `Runtime is ${state.runtimePaused ? "PAUSED" : "active"}. Open circuits: ${openCircuits}/${circuits.length}.`
    case "diagnostic":
      return `Diagnostic: ${openCircuits} open circuit(s) detected. Runtime paused: ${state.runtimePaused}.`
    case "action":
      return `Action requested. Runtime is ${state.runtimePaused ? "paused — unpause first" : "active and ready"}. ${openCircuits} circuit(s) open.`
    case "forecast":
      return `Forecast: Based on ${openCircuits} open circuits, system stability is ${openCircuits > 2 ? "at risk" : "stable"}.`
    default:
      return `History query processed. ${circuits.length} total circuits tracked.`
  }
}

export function processQuery(queryText: string, operatorId: string, tenantId?: string): OperatorQuery {
  const intent = detectIntent(queryText)
  const entities = parseEntities(queryText)
  const confidence = intent !== "history" ? 0.8 : 0.5
  const query: OperatorQuery = {
    id: crypto.randomUUID(),
    queryText,
    operatorId,
    tenantId,
    intent,
    parsedEntities: entities,
    response: buildResponse(intent),
    confidence,
    processedAt: new Date().toISOString(),
  }
  if (QUERIES.length >= CAP) QUERIES.shift()
  QUERIES.push(query)
  return query
}

export function getQueryHistory(operatorId: string, limit = 50): OperatorQuery[] {
  return QUERIES.filter(q => q.operatorId === operatorId).slice(-limit)
}

export function getQueryStats(): { total: number; byIntent: Record<string, number>; avgConfidence: number } {
  const byIntent: Record<string, number> = {}
  let totalConfidence = 0
  for (const q of QUERIES) {
    byIntent[q.intent] = (byIntent[q.intent] ?? 0) + 1
    totalConfidence += q.confidence
  }
  return {
    total: QUERIES.length,
    byIntent,
    avgConfidence: QUERIES.length > 0 ? totalConfidence / QUERIES.length : 0,
  }
}
