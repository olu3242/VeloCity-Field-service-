# VeloCity Workflow Templates

Reusable, enterprise-grade workflow definitions for the platform's core operational processes.

---

## Dispute Resolution Workflow
**ID:** `dispute-resolution-v1` | **Trigger:** `dispute_opened` | **Human-in-loop:** Yes

```
dispute_opened
    ↓
[intake] IVY analyzes dispute
    ↓ success                    ↓ failure
[evidence_check]             [human_review]
confidence >= 0.8?
    ↓ yes          ↓ no
[auto_resolve]  [human_review]
emit dispute_resolved   Admin 48h window
    ↓                       ↓ approved
[payout_hold_check]    [apply_resolution]
                            ↓
                       [notify_parties]
                       Customer + Provider
                            ↓
                       [payout_hold_check]
```

**Escalation:**
- Any step fails → notify admin
- Approval denied → pause workflow
- 48h timeout → notify admin + operations

**Tenant configurable:** Yes (thresholds, timeout durations, notification templates)

---

## Payout Release Workflow
**ID:** `payout-release-v1` | **Trigger:** `payout_queued` | **Human-in-loop:** Conditional

```
payout_queued
    ↓
[risk_check] FINN assesses risk
    ↓ success                ↓ failure
[policy_check]           [hold_review]
Within daily cap?        Finance 24h window
    ↓ yes    ↓ no              ↓ approved
[compliance_check] [hold_review]  →  [auto_release]
No open disputes?
    ↓ yes         ↓ no
[auto_release]  [hold_review]
emit payout_released
    ↓
[notify_provider]
```

**Gates:**
1. FINN risk score (auto-block high risk)
2. Daily payout cap ($50K per tenant)
3. No active disputes on the job

**Escalation:**
- Any failure → notify finance + admin
- 24h timeout → notify finance

---

## Fraud Investigation Workflow
**ID:** `fraud-investigation-v1` | **Trigger:** `payment_failed` (fraud signal) | **Human-in-loop:** Yes | **Tenant configurable:** No

```
fraud_signal_detected
    ↓
[signal_intake] GABRIEL scores fraud
    ↓
[immediate_block] Block account NOW
    ↓
[notify_admin] Alert operations (critical priority)
    ↓
[investigation] Admin review 24h window
    ↓ confirmed fraud         ↓ false positive
[escalate_fraud]          [restore_account]
emit dispute_opened       emit restore event
```

**Key characteristics:**
- Immediate block before investigation (safety-first)
- Non-configurable (security policy cannot be tenant-overridden)
- Critical priority notifications bypass normal rate limits
- Full audit trail: GABRIEL records every step

---

## Adding New Workflow Templates

1. Create `src/lib/workflows/templates/{name}-workflow.ts`
2. Define using `defineWorkflow()` from `../dsl`
3. Run `validateWorkflow(def)` to verify step references
4. Export from `src/lib/workflows/index.ts`
5. Register trigger in router or handler (emit trigger event to activate)
6. Document here with flow diagram

---

## Workflow Registry

All active templates:

| ID | Template | Trigger | Human-in-Loop |
|---|---|---|---|
| `dispute-resolution-v1` | Dispute Resolution | `dispute_opened` | Yes |
| `payout-release-v1` | Payout Release | `payout_queued` | Conditional |
| `fraud-investigation-v1` | Fraud Investigation | `payment_failed` (fraud) | Yes |

---

## Planned Templates (Roadmap)

| Template | Trigger | Priority |
|---|---|---|
| Provider Onboarding | `provider_applied` | P1 |
| Provider Suspension Review | `provider_scoring` (critical) | P1 |
| Chargeback Response | `chargeback_opened` | P1 |
| SLA Breach Recovery | `sla_breach` | P2 |
| Customer Churn Intervention | `retention_campaign` | P2 |
| Warranty Callback | `warranty_callback_due` | P3 |
