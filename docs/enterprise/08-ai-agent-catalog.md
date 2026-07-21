# AI Agent Catalog

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21  
**Source:** `src/lib/agents/coordinator.ts`

---

## Overview

VeloCity operates 10 specialist agents managed through a coordination layer in `src/lib/agents/coordinator.ts`. Agents are invoked via `coordinateAgents(tenantId, agentTypes)` and run in parallel using `Promise.all()`. Each agent is independently executed — one agent's failure does not block the others.

Agent execution produces an `AgentAnalysis` object:
```typescript
interface AgentAnalysis {
  agent: SpecialistAgentType;
  confidence: number;        // 0–100 score indicating data quality and analysis certainty
  summary: string;           // One-line factual summary (e.g., "MRR $12,400, renewal 78.3%")
  recommendations: string[]; // Prioritized action list based on current data
  reasoning: string;         // Source explanation for the analysis
  metadata?: Record<string, unknown>; // Raw values used in the analysis
}
```

After all agents complete, the coordinator writes a synthesis to `enterprise_memory` via `storeEnterpriseMemory()` and returns a `CoordinationResult` with the combined analyses, synthesized recommendation, and overall confidence.

---

## Coordination Layer

**Function:** `coordinateAgents(tenantId: string, agentTypes: SpecialistAgentType[]): Promise<CoordinationResult>`

**Execution model:** `Promise.all(agentTypes.map(...))` — all requested agents run in parallel.

**Synthesis:** After all agents complete, recommendations containing the words `risk`, `open`, or `breach` are extracted as critical recommendations. The first critical recommendation becomes the `synthesizedRecommendation`. If none exist: `"All systems nominal — continue standard operating cadence"`.

**Confidence:** `overallConfidence = round(mean(agent.confidence))` across all agents in the run.

**Memory persistence:** Every coordination call writes to `enterprise_memory` with `category: "recommendation"`, `actorType: "agent"`, `actorId: "coordinator"`, and `importance: "high"` if more than 2 critical recommendations exist.

**Agent registry:** `ALL_SPECIALIST_AGENTS` constant lists all 10 types:
```typescript
export const ALL_SPECIALIST_AGENTS: SpecialistAgentType[] = [
  "executive-advisor", "customer-success", "finance-agent",
  "risk-analyst", "compliance-agent", "provider-coach",
  "growth-strategist", "dispatch-agent", "franchise-advisor", "commercial-advisor",
];
```

**Governance gates:** Before each agent run, the coordinator checks:
1. `isAgentEnabled(agentName)` from `src/lib/governance/operator.ts` — returns false if the agent was disabled via `POST /api/admin/runtime { "action": "disable_agent" }`
2. `isOpen(circuitKey)` from `src/lib/governance/circuit-breaker.ts` — blocks agent execution if the circuit for that agent's dependency is open

---

## Agent 1: executive-advisor

**Specialist function:** `runExecutiveAdvisor(tenantId)`  
**Confidence:** 82

**Trigger:** Called as part of `coordinateAgents()`, typically on the `agent_run` automation event or via the admin intelligence dashboard.

**Inputs queried:**
- `computeExecutiveIntelligence(tenantId)` — resolves from `src/lib/governance/executiveIntelligence.ts`; includes retention risk (`atRiskMemberCount`) and expansion pipeline (`openOpportunityCount`)
- `computeRecurringRevenueIntelligence(tenantId)` — resolves from `src/lib/membership/membershipRevenueIntelligence.ts`; returns `mrrCents`, `arrCents`, `renewalRate`

**Outputs:**
- `summary`: e.g., `"MRR $12,400, ARR $148,800, renewal 78.3%"`
- `recommendations` based on:
  - MRR < $1,000 (100,000 cents): accelerate membership acquisition
  - Renewal rate < 80%: activate retention campaigns
  - `atRiskMemberCount > 0`: executive attention needed
  - `openOpportunityCount > 0`: territory expansion opportunities
- `metadata`: `{ mrrCents, arrCents, renewalRate }`

**Permissions:** Read-only. Calls read-only intelligence functions; no database writes.  
**Failure behavior:** Error is caught by the coordinator's `Promise.all` rejection handling. Returns `ErrorAnalysis` with the error message; coordinator continues with remaining agents.  
**Audit trail:** `enterprise_memory` row written by coordinator after completion.

---

## Agent 2: customer-success

**Specialist function:** `runCustomerSuccessAgent(tenantId)`  
**Confidence:** 88

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried:**
- `computeMembershipRetentionIntelligence(tenantId)` — returns `atRiskMembers`, `upcomingRenewals`, `inactiveMembers`
- Filters: `atRiskMembers` where `churnRiskLevel === "high"`; `upcomingRenewals` where `daysUntilRenewal <= 7`

**Outputs:**
- `summary`: e.g., `"3 high-risk, 2 urgent renewals, 8 inactive"`
- `recommendations` based on:
  - High-churn-risk member count > 0: immediate outreach needed
  - Urgent renewals (≤ 7 days) > 0: send renewal reminders
  - Inactive members > 5: schedule wellness calls
- `metadata`: `{ atRiskCount, urgentRenewals }`

**Permissions:** Read-only.  
**Failure behavior:** Returns error analysis; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 3: finance-agent

**Specialist function:** `runFinanceAgent(tenantId)`  
**Confidence:** 85

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried directly from Supabase (`getAdminClient()`):**
- `revenue_records` — selects `gross_amount_cents`, `platform_fee_cents` for last 30 days
- `payouts` — selects `amount_cents`, `status` where `status = "pending"`
- `disputes` — count of open disputes (`status = "open"`)

**Outputs:**
- `summary`: e.g., `"30d GMV $84,200, fees $8,420, pending payouts $12,000"`
- `recommendations` based on:
  - Pending payouts > $10,000 (1,000,000 cents): review release schedule
  - Open disputes > 5: prioritize resolution
  - Platform fee margin < 10% (fees/GMV < 0.1): review pricing structure
- `metadata`: `{ gmv, fees, pendingPayouts, openDisputes }`

**Permissions:** Read-only. Uses `getAdminClient()` (service_role) to bypass RLS for cross-tenant financial aggregation in admin context.  
**Failure behavior:** Returns error analysis; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 4: risk-analyst

**Specialist function:** `runRiskAnalyst(tenantId)`  
**Confidence:** 79

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried:**
- `getAllCircuits()` from `src/lib/governance/circuit-breaker.ts` — all in-memory circuits; filters for `state === "open"`
- `providers` table — selects providers with `trust_score < 40` OR `cancellation_rate >= 0.15` (up to 10 rows)
- `commercial_contracts` table — count of `status = "at_risk"` contracts

**Outputs:**
- `summary`: e.g., `"2 open circuits, 3 at-risk providers, 1 at-risk contract"`
- `recommendations` based on:
  - Open circuits > 0: lists circuit names
  - High-risk providers found: count and note
  - At-risk contracts > 0: count and note
- `metadata`: `{ openCircuits: [circuit_key_names] }`

**Permissions:** Read-only (circuit state from in-memory; database queries via service_role).  
**Failure behavior:** Returns error analysis; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 5: compliance-agent

**Specialist function:** `runComplianceAgent(tenantId)`  
**Confidence:** 75

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried:**
- `audit_logs` — count of events in last 30 days for this tenant
- `agent_logs` — count of rows where `error IS NOT NULL` in last 30 days for this tenant

**Outputs:**
- `summary`: e.g., `"342 audit events, 4 agent errors (30d)"`
- `recommendations` based on:
  - Agent error count > 10: review automation health
  - Audit log count < 50: verify automation event emission
  - Zero errors AND audit count >= 50: compliance posture healthy
- `metadata`: `{ auditCount, errorCount }`

**Permissions:** Read-only via `getAdminClient()`.  
**Failure behavior:** Returns error analysis; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 6: provider-coach

**Specialist function:** `runProviderCoach(tenantId)`  
**Confidence:** 80

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried:**
- `providers` table — selects the top provider by `trust_score DESC` with `status = "approved"` for this tenant
- `computeProviderGrowthIntelligence(providerId)` — returns `revenueOpportunities`, `pricingOpportunities`, `geographicExpansionOpportunities`, `expectedRevenueImpactCents`

**Outputs:**
- `summary`: e.g., `"3 revenue opps, 2 pricing gaps, $4,200 potential uplift"`
- `recommendations` based on:
  - No approved providers: prioritize onboarding (returns early with confidence 60)
  - Revenue opportunities: count
  - Pricing opportunities: count
  - Geographic expansion zones: count
  - Expected revenue impact: dollar amount
- `metadata`: `{ expectedRevenueImpactCents }`

**Permissions:** Read-only.  
**Failure behavior:** Returns error analysis or early-exit with no-providers message; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 7: growth-strategist

**Specialist function:** `runGrowthStrategist(tenantId)`  
**Confidence:** 78

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried:**
- `franchise_territories` table — selects `id`, `city`, `state`, `provider_count`, `active_customers`, `monthly_revenue_cents` (up to 10 rows)
- `calculateCityReadinessScore({ demandIndex, providerCount, activeCustomers, monthlyRevenueCents })` from `src/lib/expansion/cityReadinessScore.ts`
- `calculateTerritoryOpportunityScore({ demandIndex, providerGap })` from `src/lib/expansion/territoryOpportunityScore.ts`

**Outputs:**
- `summary`: e.g., `"4 territories, 2 high-opportunity, $18,400 MRR"`
- `recommendations` based on:
  - No territories configured: define service territories (returns early with confidence 60)
  - Territories with readiness >= 70 AND opportunity >= 60: high-opportunity count
  - Fewer than 3 territories: multi-market expansion recommended
  - Combined territory MRR > 0: benchmark against expansion cost models
- `metadata`: `{ territoryCount, highOpportunityCount }`

**Permissions:** Read-only.  
**Failure behavior:** Returns error analysis or early-exit; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 8: dispatch-agent

**Specialist function:** `runDispatchAgent(tenantId)`  
**Confidence:** 83

**Trigger:** Called as part of `coordinateAgents()`. Also relevant when the `sla_warn` or `sla_breach` automation events fire.

**Inputs queried:**
- `jobs` — count where `status IN ("pending", "searching")` for this tenant
- `providers` — count where `status = "approved"` for this tenant
- `jobs` — count where `urgency = "emergency"` AND `status IN ("pending", "searching")`
- `forecastSlaRisk({ openJobs, activeProviders, emergencyJobs })` from `src/lib/prediction/slaForecast.ts` — returns `{ breachRisk: "low" | "medium" | "high", riskScore: number }`

**Outputs:**
- `summary`: e.g., `"12 open jobs, 5 providers, 1 emergency, SLA risk medium"`
- `recommendations` based on:
  - SLA breach risk HIGH: surge routing needed immediately
  - SLA breach risk MEDIUM: monitor dispatch queue
  - Emergency jobs > 0: prioritize provider matching
  - Zero active providers: dispatch completely blocked
  - `openJobs > activeProviders * 3`: queue depth at risk
- `metadata`: `{ openJobs, activeProviders, emergencyJobs, slaRiskScore, breachRisk }`

**Permissions:** Read-only via `getAdminClient()`.  
**Failure behavior:** Returns error analysis; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 9: franchise-advisor

**Specialist function:** `runFranchiseAdvisor(tenantId)`  
**Confidence:** 74

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried:**
- `franchise_territories` table — selects `id`, `city`, `state`, `status`, `monthly_revenue_cents`
- `territory_operators` table — selects `territory_id`, `status`
- Computes unmanned territories: territories without any `territory_operators` row where `status = "active"`

**Outputs:**
- `summary`: e.g., `"6 territories, 2 unmanned, $42,000 total MRR"`
- `recommendations` based on:
  - Unmanned territories > 0: assign franchise leads
  - No territories configured: configure to enable franchise intelligence
  - Average territory MRR < $50,000 (5,000,000 cents): accelerate activation
- `metadata`: `{ territoryCount, unmannedCount, totalRevenueCents }`

**Permissions:** Read-only via `getAdminClient()`.  
**Failure behavior:** Returns error analysis; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Agent 10: commercial-advisor

**Specialist function:** `runCommercialAdvisor(tenantId)`  
**Confidence:** 81

**Trigger:** Called as part of `coordinateAgents()`.

**Inputs queried:**
- `computeCommercialRevenueIntelligence(tenantId)` from `src/lib/commercial/commercialRevenueIntelligence.ts` — returns `totalCommercialRevenueCents`, `activeContractValueCents`, `atRiskContracts`, `renewalPipeline`

**Outputs:**
- `summary`: e.g., `"$28,400 commercial revenue, 2 at-risk, 3 renewals pending"`
- `recommendations` based on:
  - At-risk contracts > 0: schedule executive reviews
  - Renewal pipeline > 0: initiate renewal outreach
  - `totalCommercialRevenueCents < activeContractValueCents * 0.7`: investigate attainment gaps
- `metadata`: `{ totalCommercialRevenueCents, atRiskCount }`

**Permissions:** Read-only via `computeCommercialRevenueIntelligence`.  
**Failure behavior:** Returns error analysis; coordinator continues.  
**Audit trail:** `enterprise_memory` via coordinator.

---

## Common Failure Behaviors

All agents share the same failure contract:

1. If the agent's data query fails (Supabase error), the agent function throws
2. The coordinator's `Promise.all()` catches the rejection
3. The failed agent's slot in `analyses` is either absent or replaced with an error analysis object
4. Remaining agents complete normally
5. The coordination result is still returned with whichever agents succeeded
6. The error is logged server-side via `console.error` or the logger

No agent throws a fatal error that propagates to the caller of `coordinateAgents()`.

---

## Audit and Memory Trail

Every agent run produces entries in two persistent stores:

| Store | What is recorded |
|---|---|
| `agent_logs` table | Individual agent executions (agent_name, action, input, output, error, latency_ms, tokens_used) |
| `enterprise_memory` table | Coordination results: synthesized recommendation, agent list, overall confidence, importance level, tags: `["multi-agent", "coordination"]` |

Query recent agent coordination results:
```sql
SELECT summary, detail, importance, created_at
FROM enterprise_memory
WHERE tenant_id = '<tenant_uuid>'
  AND category = 'recommendation'
  AND 'multi-agent' = ANY(tags)
ORDER BY created_at DESC
LIMIT 20;
```
