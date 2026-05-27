# VeloCity AI Agent Registry

All 10 VeloCity agents are registered in `src/lib/agents/registry.ts` with enterprise contract metadata.

---

## ALICE — Customer Intake & Classification
**ID:** `alice-v1` | **Type:** `intake` | **Status:** active

**Triggered by:** `service_request_created`, `serviceability_passed`, `serviceability_failed`

**Capabilities:**
- Classify service requests by trade, urgency, and complexity
- Detect fraudulent or unserviceable requests
- Estimate job parameters for MAX pre-dispatch

**Execution limits:** 1024 tokens · 15s timeout · 2 retries
**Audit:** full | **Retry:** exponential

---

## MAX — Dispatch & Provider Matching
**ID:** `max-v1` | **Type:** `dispatch` | **Status:** active

**Triggered by:** `provider_offer_sent`, `provider_offer_expired`, `job_reassigned`, `no_provider_accepted`

**Capabilities:**
- Score provider-job compatibility across 8 dimensions
- Recommend dispatch priority order
- Detect dispatch anomalies (no accepts, late responses)

**Execution limits:** 2048 tokens · 20s timeout · 2 retries
**Audit:** full | **Retry:** exponential

---

## QUINN — Quote & Pricing Guidance
**ID:** `quinn-v1` | **Type:** `quote` | **Status:** active

**Triggered by:** `quote_submitted`, `quote_validated`, `quote_flagged`, `change_order_submitted`, `quote_approved`, `quote_rejected`

**Capabilities:**
- Validate quote line items against market rates
- Detect price gouging and anomalous markups
- Flag change orders requiring customer review
- Recommend fair price adjustments

**Execution limits:** 2048 tokens · 20s timeout · 2 retries
**Audit:** full | **Retry:** exponential

---

## NOVA — Job Workflow Orchestration
**ID:** `nova-v1` | **Type:** `workflow` | **Status:** active

**Triggered by:** `job_accepted`, `job_state_changed`, `job_started`, `job_completed`, `customer_confirmed`

**Capabilities:**
- Validate job state transitions
- Send contextual status notifications
- Detect workflow stalls and stuck states
- Trigger escalation for overdue milestones

**Execution limits:** 1024 tokens · 15s timeout · 3 retries
**Audit:** standard | **Retry:** exponential

---

## REX — Quality & Trust Monitoring
**ID:** `rex-v1` | **Type:** `quality` | **Status:** active

**Triggered by:** `job_completed`, `provider_scoring`, `provider_scoring_due`

**Capabilities:**
- Analyze reviews for authenticity and sentiment
- Calculate provider trust score delta per job
- Flag providers for quality review
- Recommend training or suspension

**Execution limits:** 2048 tokens · 25s timeout · 2 retries
**Audit:** full | **Retry:** exponential

---

## IVY — Dispute Resolution Intelligence
**ID:** `ivy-v1` | **Type:** `dispute` | **Status:** active

**Triggered by:** `dispute_opened`, `dispute_resolved`

**Capabilities:**
- Score evidence strength (customer vs. provider)
- Recommend resolution: refund / pay_provider / split / escalate
- Generate mediation communications for both parties
- Detect fraudulent dispute patterns
- Forecast dispute outcomes (churn risk, platform liability)

**Execution limits:** 4096 tokens · 30s timeout · 2 retries
**Audit:** full | **Retry:** exponential

**IVY as enterprise orchestration intelligence:**
IVY operates through runtime contracts only — never direct page calls. All recommendations are logged, auditable, and subject to operator override. IVY's outputs feed:
- `dispute_risk_score` (scoring engine)
- `payout_hold` (FINN integration)
- `provider_suspension_review` (REX integration)
- `customer_retention_trigger` (LENA integration)

---

## FINN — Finance & Payment Monitoring
**ID:** `finn-v1` | **Type:** `finance` | **Status:** active

**Triggered by:** `payment_authorized`, `payment_captured`, `payment_failed`, `refund_requested`, `refund_issued`, `chargeback_opened`, `payout_queued`, `payout_released`, `payout_failed`, `quote_approved`

**Capabilities:**
- Reconcile payment flows against job lifecycle
- Flag anomalous payment amounts
- Monitor chargeback rates
- Recommend payout timing and risk holds
- Detect revenue leakage

**Execution limits:** 2048 tokens · 20s timeout · 3 retries
**Audit:** full | **Retry:** exponential

---

## LENA — Customer Retention & Rebooking
**ID:** `lena-v1` | **Type:** `retention` | **Status:** active

**Triggered by:** `review_requested`, `subscription_due`, `warranty_callback_due`, `retention_campaign`, `retention_campaign_due`

**Capabilities:**
- Predict churn probability per customer
- Generate personalized rebooking recommendations
- Sequence lifecycle campaigns
- Score customer lifetime value

**Execution limits:** 2048 tokens · 20s timeout · 2 retries
**Audit:** standard | **Retry:** exponential

---

## TESS — Territory & Market Intelligence
**ID:** `tess-v1` | **Type:** `territory` | **Status:** active

**Triggered by:** `daily_territory_analysis`, `high_demand_area_detected`, `provider_shortage_detected`, `surge_pricing_recommended`, `territory_ready_for_expansion`, `franchise_candidate_area_detected`

**Capabilities:**
- Analyze supply/demand imbalances by zip/territory
- Recommend surge pricing activation
- Surface expansion and franchise opportunity signals
- Forecast seasonal demand patterns

**Execution limits:** 4096 tokens · 30s timeout · 2 retries
**Audit:** standard | **Retry:** exponential

---

## GABRIEL — Governance & Compliance
**ID:** `gabriel-v1` | **Type:** `governance` | **Status:** active

**Triggered by:** Every automation event (universal audit hook via router.ts)

**Capabilities:**
- Audit every automation event (inserted in `agent_logs` on every route call)
- Screen provider applications for compliance flags
- Detect policy violations
- Generate compliance reports

**Execution limits:** 2048 tokens · 20s timeout · 2 retries
**Audit:** full | **Retry:** none (audit failures must not retry silently)

---

## Registry API

```typescript
import { AGENT_REGISTRY, getAgent, getAgentsByEvent, getActiveAgents } from "@/lib/agents/registry";

// Get all agents triggered by an event
const agents = getAgentsByEvent("dispute_opened"); // [IVY registration]

// Get specific agent contract
const ivy = getAgent("IVY");

// Get all currently active agents
const active = getActiveAgents();
```
