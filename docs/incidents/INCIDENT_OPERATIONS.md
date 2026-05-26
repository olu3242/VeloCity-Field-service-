# VeloCity Incident Operations

## Overview

The incident operations layer (`src/lib/incidents/`) provides structured incident lifecycle management — from automatic severity classification through escalation chains and audit timelines — integrated with the event fabric for automated response.

---

## Incident Lifecycle (`incident-manager.ts`)

```typescript
const incident = await createIncident({
  title: "Payment processing failure — 35% failure rate",
  description: "Stripe timeout causing cascade payment failures",
  severity: "sev2",
  triggeredBy: "payment_failed",
  affectedSystems: ["payment-processor", "automation-queue"],
  tenantId: "tenant-abc",
});
// Automatically emits "agent_run" → GABRIEL for governance audit

updateIncident(incident.id, { status: "investigating", assignedTo: "ops-lead" });
updateIncident(incident.id, { status: "resolved" });  // sets resolvedAt

getOpenIncidents("tenant-abc");
getIncidentsBySeverity("sev1");
```

**Status flow:** `open` → `investigating` → `mitigating` → `resolved` → `closed`

---

## Severity Classification (`severity-classifier.ts`)

Automatic severity assignment from runtime signals:

```typescript
classifySeverity({
  eventType: "payment_failed",
  failureRate: 0.35,
  tenantTier: "enterprise",
  isPaymentRelated: true,
  affectedTenantCount: 3,
});
// → "sev2" (failureRate > 0.2 OR isPaymentRelated)
```

**Classification rules (first match wins):**

| Severity | Conditions |
|---|---|
| sev1 (Critical) | Payment failure > 50%, OR > 10 tenants affected, OR enterprise SLA breach |
| sev2 (High) | Failure > 20%, OR queue depth > 200, OR > 5 tenants, OR payment-related |
| sev3 (Medium) | Failure > 5%, OR queue depth > 100, OR enterprise tenant |
| sev4 (Low) | Default |

**Response SLAs:** sev1 = 5 min | sev2 = 15 min | sev3 = 1 hr | sev4 = 24 hr

---

## Escalation Chains (`escalation-chain.ts`)

Automatic multi-tier escalation per severity:

```typescript
const chain = startEscalationChain(incident.id, "sev1");
// Steps: on-call (pager, 5min) → engineering-lead (pager, 10min) → vp-engineering (pager, 20min)

advanceEscalation(incident.id);   // fires next un-acknowledged step
acknowledgeStep(incident.id, 1);  // stops escalation at that tier
cancelChain(incident.id);         // on incident resolved

getActiveChains();  // all ongoing escalation chains
```

**Default escalation chains:**

| Severity | Steps |
|---|---|
| sev1 | on-call (pager) → eng-lead (pager) → vp-eng (pager) |
| sev2 | on-call (slack) → eng-lead (slack) |
| sev3 | on-call (email) |
| sev4 | on-call (email, 24hr) |

---

## Incident Timeline (`incident-timeline.ts`)

Full audit trail for every incident:

```typescript
addTimelineEntry(incident.id, "GABRIEL", "anomaly_detected", "35% payment failure rate");
addTimelineEntry(incident.id, "system", "severity_classified", "sev2 auto-assigned");
addTimelineEntry(incident.id, "ops-lead", "acknowledged", "Taking ownership");
addTimelineEntry(incident.id, "FINN", "recovery_initiated", "Retry queue cleared");
addTimelineEntry(incident.id, "ops-lead", "resolved", "Stripe timeout resolved");

exportIncidentSummary(incident.id);
// { incident, timeline: [5 entries], duration: "38 min" }
```

---

## Incident Events

| Event | Trigger | Effect |
|---|---|---|
| `agent_run` (GABRIEL) | `createIncident()` | Governance audit initiated |
| `sla_escalate` | Escalation chain advance | HERALD SLA handler |

---

## Integration with Monitoring

Incidents feed into:
- `operational-memory` — each resolved incident stored with outcome
- `escalation-history` — escalation records linked to incident id
- `throughput-dashboard` — incident count visible in ops dashboard
