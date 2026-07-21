# Runtime Certification Report

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21  
**Certification engine:** `src/lib/certification/enterprise-report.ts`

---

## 1. Certification Methodology

The certification engine runs at every call to `generateEnterpriseCertification()`, which is invoked by both health endpoints on each request. There is no cached result — the score is computed live from five independent validators:

| Validator | Module | Weight |
|---|---|---|
| Architecture compliance | `src/lib/certification/architecture-validator.ts` | 25% |
| Topology validity | `src/lib/certification/topology-validator.ts` | 20% |
| Operational readiness | `src/lib/maturity/readiness-scorer.ts` | 30% |
| Compliance | `src/lib/maturity/compliance-validator.ts` | 15% |
| Resilience | `src/lib/simulation/resilience-tester.ts` | 10% |

Weighted overall score formula:

```
overallScore = round(
  archScore   * 0.25 +
  topoScore   * 0.20 +
  readiness.composite * 0.30 +
  compliance.score    * 0.15 +
  resScore    * 0.10
)
```

Each dimension score is computed as `round((passed / (passed + failed)) * 100)` against the dimension's internal checks. A dimension with zero checks scores 100 by default.

---

## 2. Certification Levels

| Level | Score threshold | `certified` flag |
|---|---|---|
| `enterprise` | >= 95 | true |
| `premium` | >= 85 | true |
| `standard` | >= 70 | false |
| `uncertified` | < 70 | false |

The `certified` flag is `overallScore >= 85`. This is distinct from the certification level string. A score of 83 produces `certificationLevel = "standard"` and `certified = false`.

---

## 3. Current Score (Sprint: Production Hardening, 2026-07-21)

Based on the release readiness report (`docs/release-readiness.md`), the platform's composite readiness score after the production hardening sprint is **83/100**.

| Area | Score | Change from prior sprint |
|---|---|---|
| Customer booking flow | 95 | — |
| Provider workflow | 90 | — |
| Payment processing | 91 | +3 |
| Admin operations | 85 | — |
| AI agent automation | 84 | +2 |
| Franchise ops | 75 | — |
| Notification delivery | 62 | — |
| Error handling | 72 | +27 |
| API security | 75 | +35 |
| Env validation | 95 | +60 |
| Test coverage | 38 | +36 |
| **Overall** | **83** | **+13** |

At 83, `certificationLevel = "standard"` and `certified = false`. The gap to `premium` certification (85) is 2 points. The primary blockers are notification delivery (62) and the remaining test coverage gap (38).

---

## 4. Dimension-by-Dimension Status

### Architecture (weight 25%)
- Validates that the agent registry, governance layer, and service adapters are present and correctly configured.
- Critical failures are surfaced as `criticalIssues` in the certification report and propagated to the health endpoint.
- Source: `validateArchitecture()` in `src/lib/certification/architecture-validator.ts`.

### Topology (weight 20%)
- Validates that all registered adapters and agents are active and reachable within the topology map.
- Returns `topologyValid: boolean` used in the `sections.topology.valid` field of `EnterpriseCertificationReport`.
- Source: `validateTopology()` in `src/lib/certification/topology-validator.ts`.

### Operational Readiness (weight 30%) — highest weight
- Composite score from `scoreOperationalReadiness()` in `src/lib/maturity/readiness-scorer.ts`.
- Returns `{ composite, certificationLevel }`.
- This dimension has the most influence on the final score. Circuit breaker health and governance issues are reflected here.

### Compliance (weight 15%)
- Validates policy controls from `runComplianceValidation()` in `src/lib/maturity/compliance-validator.ts`.
- Returns `{ overallCompliant, score }`.
- Compliance violations are logged as recommendations.

### Resilience (weight 10%)
- Fault-tolerance posture from `getResilienceReport()` in `src/lib/simulation/resilience-tester.ts`.
- Returns `{ passed, failed }` from resilience test runs.

---

## 5. Circuit Breaker Inventory

Circuit breakers are managed in `src/lib/governance/circuit-breaker.ts`. The implementation uses an in-memory `Map<string, CircuitBreaker>` keyed by a string circuit key.

**Default parameters for all circuits:**

| Parameter | Value |
|---|---|
| Failure threshold | 5 consecutive failures |
| Reset time | 60,000 ms (1 minute) |
| Half-open recovery | Single success closes the circuit |

**Circuit lifecycle:**

| State | Trigger | Behavior |
|---|---|---|
| `closed` | Initial state / after recovery | Requests pass through normally |
| `open` | `failureCount >= threshold` or any failure in `half-open` | `isOpen(key)` returns true; requests are blocked |
| `half-open` | `elapsed >= resetTimeMs` since `openedAt` | One request allowed through; success closes, failure reopens |

**Key functions:**

- `getCircuit(key)` — returns or creates a circuit for the given key
- `isOpen(key)` — checks open state (triggers half-open transition if elapsed)
- `recordSuccess(key)` — increments success count; closes from half-open
- `recordFailure(key)` — increments failure count; opens at threshold
- `resetCircuit(key)` — admin manual reset, replaces state with a fresh closed circuit
- `getAllCircuits()` — returns all known circuits (used by health endpoints)

Circuit keys are strings created at runtime when a circuit is first accessed. There is no pre-defined registry of circuit keys. The full list of active circuits is visible at `GET /api/health/detailed` and `GET /api/admin/runtime`.

**Important limitation:** Circuit state is in-memory and resets on process restart. A deployment or Vercel cold start clears all circuit breaker state. DB persistence is documented as a future enhancement.

---

## 6. Health Endpoints

### GET /api/health

Returns a lightweight summary suitable for uptime monitors and load balancers.

**Response shape:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "score": 83,
  "certified": false,
  "certificationLevel": "standard",
  "runtimePaused": false,
  "openCircuits": 0,
  "totalCircuits": 5,
  "checkedAt": "2026-07-21T00:00:00.000Z"
}
```

**Status logic:**
- `healthy`: score >= 85 AND openCircuits == 0 AND NOT runtimePaused
- `degraded`: score >= 70 OR openCircuits > 0 (note: score 83 without open circuits resolves to `degraded` because 83 < 85)
- `unhealthy`: score < 70 AND no open circuits

### GET /api/health/detailed

Returns the full certification object and per-circuit details.

**Response shape:**
```json
{
  "ok": true,
  "certification": { EnterpriseCertificationReport },
  "circuits": [
    { "key": "...", "state": "closed", "failureCount": 0 }
  ],
  "runtimePaused": false,
  "checkedAt": "2026-07-21T00:00:00.000Z"
}
```

The `certification` object contains `overallScore`, `certified`, `certificationLevel`, `sections` (per-dimension scores), `criticalIssues`, `recommendations`, and `generatedAt`.

---

## 7. Runtime Controls (POST /api/admin/runtime)

Admin-authenticated POST actions available via the runtime control API. All actions require `admin` or `super_admin` role.

| Action | Payload | Effect |
|---|---|---|
| `pause_runtime` | `{ "action": "pause_runtime", "reason": "string" }` | Sets `runtimePaused = true` in operator state; queue worker skips all processing |
| `resume_runtime` | `{ "action": "resume_runtime" }` | Clears pause state; queue resumes immediately |
| `disable_agent` | `{ "action": "disable_agent", "agent_name": "..." }` | Adds agent name to `disabledAgents` set; agent skipped in coordinator runs |
| `enable_agent` | `{ "action": "enable_agent", "agent_name": "..." }` | Removes agent from `disabledAgents` |
| `reset_circuit` | `{ "action": "reset_circuit", "circuit_key": "..." }` | Calls `resetCircuit(key)` — replaces circuit state with a fresh closed circuit |
| `replay_event` | `{ "action": "replay_event", "event_id": "..." }` | Re-queues an event for processing |

Operator state is managed in `src/lib/governance/operator.ts`. All state is in-memory; it resets on process restart.

---

## 8. Startup Validation

`src/env.ts` validates all environment variables at module load time using Zod's `safeParse`. If validation fails, the process throws before any request is served:

```
ENVIRONMENT VALIDATION FAILED — startup aborted.
The following environment variables are missing or invalid:
  • ANTHROPIC_API_KEY: ANTHROPIC_API_KEY is required
```

Required variables that cause hard startup failures: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`.

This means a misconfigured Vercel deployment will fail its first request (or health check) immediately with a structured error, not silently degrade.
