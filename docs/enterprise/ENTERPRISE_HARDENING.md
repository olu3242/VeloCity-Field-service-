# VeloCity Enterprise Hardening

## Overview

Enterprise hardening ensures VeloCity meets the operational, compliance, and reliability standards required for enterprise-scale deployments. It spans governance, SLA enforcement, resource isolation, and audit completeness.

---

## Governance Readiness

### Circuit Breaker Coverage

Every AI agent and external integration has a dedicated circuit breaker:
- Threshold: 5 consecutive failures → open
- Reset window: 60 seconds in half-open state
- Admin override: `resetCircuit(agentName)` via `/api/admin/runtime`

### Operator Control Plane

```
pauseRuntime(reason)     → halts all AI dispatch + adaptive tuning
resumeRuntime(reason)    → restores full operation
disableAgent(name)       → stops specific agent without pausing platform
enableAgent(name)        → re-enables specific agent
```

All state changes are audit-logged to `audit_logs` with `actor`, `timestamp`, `reason`.

---

## SLA Contract System

| Tier | Queue Wait SLA | AI Quota | Escalation SLA |
|---|---|---|---|
| Standard | 30s | 50 calls/hr | 60 min |
| Premium | 5s | 200 calls/hr | 30 min |
| Enterprise | 1s | 1,000 calls/hr | 10 min |

SLA violations emit `sla_breach` events → HERALD agent escalation → compliance log.

---

## Tenant Isolation

`assertTenantIsolation(requestTenantId, resourceTenantId)` enforces that cross-tenant data access is blocked at every handler boundary. Bypass list (`ISOLATION_BYPASS_TENANTS`) is empty by default — requires explicit whitelisting for multi-tenant admin flows.

---

## Execution Quotas

Per-tenant limits enforce fair-use:
- Hourly event limit (default: 1,000)
- Hourly AI call limit (default: 200)
- Daily AI token budget (default: 1M tokens)
- Concurrent workflow limit (default: 10)

Quota overrides are applied per-tenant via `setQuota(tenantId, config)`.

---

## Audit Trail

Every critical operation produces an audit log entry:
- All governance state changes (pause, resume, disable, enable)
- All circuit breaker overrides
- All high-risk adaptive proposals
- All escalation resolutions
- All manual dispute overrides

Audit logs stored in `audit_logs` Supabase table: `id`, `actor`, `action`, `target`, `reason`, `metadata`, `created_at`.

---

## Enterprise Compliance Checklist

- [ ] All agents registered in `AGENT_REGISTRY` with explicit audit requirements
- [ ] Tenant isolation assertions at all handler entry points
- [ ] SLA contracts defined for all enterprise tenants
- [ ] Circuit breakers active for all external integrations
- [ ] Execution quotas configured per tenant tier
- [ ] Audit log retention ≥ 1 year
- [ ] Admin runtime control API (`/api/admin/runtime`) access-controlled
- [ ] Dead-letter queue monitored with SLA for review (< 48h)
- [ ] Governance pause tested quarterly
- [ ] Resilience score ≥ 80 before production deployment
