# VeloCity Automation Governance

## Purpose

As the automation layer scales across tenants, agents, and event types, governance prevents:
- Runaway retry loops flooding the queue
- AI recommendations executing without human oversight on high-risk actions
- Cross-tenant data bleed
- Cascading failures from a single broken handler

---

## Governance Architecture

```
Event emitted
     ↓
checkAllSafety()         ← safety.ts: dedup + flood + loop checks
     ↓
getPoliciesForEvent()    ← policies.ts: rate limits + approval requirements
     ↓
isRuntimePaused()        ← operator.ts: admin override
     ↓
isOpen(circuitKey)       ← circuit-breaker.ts: handler failure protection
     ↓
assertTenantIsolation()  ← tenant.ts: cross-tenant enforcement
     ↓
Handler executes
```

---

## Governance Layer Files

| File | Responsibility |
|---|---|
| `src/lib/governance/policies.ts` | Automation policies and rate limits |
| `src/lib/governance/circuit-breaker.ts` | Circuit breaker per agent/event-type |
| `src/lib/governance/safety.ts` | Dedup, flood, and loop prevention |
| `src/lib/governance/operator.ts` | Admin runtime controls (pause/resume/disable) |
| `src/lib/governance/tenant.ts` | Tenant isolation enforcement |

---

## Default Policies

### Dispute Automation
- Max 5 auto-resolutions per tenant per hour
- Provider suspension: always requires admin approval
- IVY recommendations: advisory only — no auto-execution without approval

### Payout Automation
- Max $50,000 auto-released per tenant per day
- Payouts above limit: queue for manual review
- Chargebacks present: block auto-payout, require FINN + admin sign-off

### Fraud Escalation
- Fraud signals: auto-block + immediately notify admin
- No delay, no retry — fraud events bypass standard backoff

### AI Execution
- Max 100 AI calls per minute per tenant
- Exceeding limit: queue excess calls, do not drop
- AI unavailable: fallback responses activate automatically (never block)

### Retry Governance
- Max 3 retries per queue item
- Backoff: 1min → 2min → 3min (exponential)
- After 3 failures: mark `failed`, write to audit_logs

---

## Tenant Isolation

Every resource access (Supabase queries, agent context, notifications) is scoped to `tenant_id`.

`assertTenantIsolation(resourceTenantId, requestTenantId)`:
- Returns `{ allowed: true }` when tenant IDs match
- Returns `{ allowed: false, reason: "cross-tenant access blocked" }` when they differ
- `null` resourceTenantId = unowned resource (allowed)

ISOLATION_BYPASS_TENANTS is empty by default. Only platform-internal service accounts are added to this list.

---

## Escalation Policies

| Trigger | Action |
|---|---|
| Circuit opens (5 consecutive failures) | Alert logged, handler paused for 60s |
| Dispute auto-resolution limit reached | Queue for admin review |
| Payout daily cap reached | Notify FINN agent + block further auto-release |
| Flood protection triggered | Log warning, continue processing other events |
| AI failure on critical event | Fallback response used, failure logged |

---

## Compliance Requirements

- Every governance check is synchronous (no DB call — sub-millisecond)
- All operator actions write to `audit_logs` (actor_id, action, timestamp, params)
- Governance state is in-memory and resets on restart — persistent governance state (DB-backed policies) is a Wave 6 roadmap item
- All policy overrides by operators are audit-logged
