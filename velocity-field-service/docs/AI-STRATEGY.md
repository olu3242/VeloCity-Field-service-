# VeloCity Field Service — AI Strategy

**Version:** 1.0  
**Owner:** Zenith AI  
**Model:** Anthropic Claude (claude-sonnet-4)

---

## Overview

VeloCity's AI strategy is not bolted on — it is the operating system. Every major workflow on the platform is AI-assisted or AI-orchestrated. The strategy is structured around a 10-agent ensemble called the **VeloCity AI OS (V·OS)**, where each agent is specialized, stateless, auditable, and human-overridable.

**Core AI principle:** AI makes every decision faster, but humans stay in the loop for money, trust, and dispute resolution.

---

## AI Philosophy

| Principle | Application |
|---|---|
| **Specialization over generalism** | 10 focused agents, each with a narrow domain, outperform one general-purpose assistant |
| **Structured I/O** | Every agent receives a typed input object and returns a typed output object — no free-form instructions in production |
| **Stateless invocations** | Agents don't remember past runs — full context is passed in each call |
| **Human override always available** | Every AI recommendation can be overridden by an admin in the command center |
| **Audit everything** | Every agent run is logged: input, output, latency, model version, confidence |
| **Graceful degradation** | If any agent fails, the workflow falls back to a human-review queue |

---

## V·OS Architecture

```
Customer Request / Job Event / Cron Trigger
          ↓
    Automation Engine (Supabase Edge Functions)
          ↓
    Agent Router → selects the right agent(s)
          ↓
    Agent Invocation (Anthropic API, claude-sonnet-4)
    ┌─────────────────────────────────────────────┐
    │  Input: structured JSON context             │
    │  System prompt: agent persona + rules       │
    │  Temperature: 0.2 (deterministic outputs)   │
    │  Max tokens: 1,000                          │
    │  Output: structured JSON recommendation     │
    └─────────────────────────────────────────────┘
          ↓
    Output stored in ai_agent_runs table
          ↓
    GABRIEL validates against governance rules
          ↓
    Automation applies recommendation (if approved)
    OR Admin reviews in command center
```

---

## Agent Deep Dives

### 1. ALICE — Intake Agent

**Purpose:** Transform raw customer messages into structured service requests.

**System prompt focus:**
- Field service domain expertise
- Urgency classification (emergency / same-day / scheduled)
- Service category disambiguation
- Photo context extraction
- Missing info elicitation

**Input contract:**
```json
{
  "customer_message": "string",
  "location": { "lat": number, "lng": number, "address": "string" },
  "photos": ["url"],
  "selected_category": "string | null",
  "chat_history": [{ "role": "string", "content": "string" }]
}
```

**Output contract:**
```json
{
  "service_category": "string",
  "subcategory": "string",
  "urgency_level": "emergency | same_day | scheduled",
  "urgency_score": 0.0-1.0,
  "problem_summary": "string",
  "missing_info": ["string"],
  "recommended_workflow": "string",
  "service_request_draft": {}
}
```

**Latency target:** ≤ 4 seconds  
**Human review trigger:** urgency_score > 0.9 (emergency escalation)

---

### 2. MAX — Dispatch Agent

**Purpose:** Rank and select the best provider for a job.

**Matching signals (weighted):**
| Signal | Weight |
|---|---|
| Distance from job location | 30% |
| Service category match | 25% |
| Trust score (REX) | 20% |
| Historical response speed | 10% |
| Current availability | 10% |
| Price tier match | 5% |

**Output contract:**
```json
{
  "provider_ranking": [
    {
      "provider_id": "uuid",
      "rank": 1,
      "match_score": 0.0-1.0,
      "distance_km": number,
      "estimated_arrival_min": number,
      "reasoning": "string"
    }
  ],
  "dispatch_type": "instant | scheduled",
  "reassign_trigger_minutes": number,
  "escalation_recommended": boolean
}
```

**Reassignment logic:** If top-ranked provider doesn't accept within `reassign_trigger_minutes`, MAX is re-invoked with that provider excluded.

---

### 3. QUINN — Quote Agent

**Purpose:** Validate provider quotes and explain pricing to customers.

**Overcharge detection heuristics:**
- Compare quote against category price benchmarks (stored per territory).
- Flag quotes > 1.5x category median as "high" (requires admin review before customer sees it).
- Flag quotes with unusual line item ratios (e.g., labor:parts > 4:1).

**Output contract:**
```json
{
  "quote_status": "approved | flagged | rejected",
  "price_confidence": "low | medium | high",
  "overcharge_flag": boolean,
  "overcharge_reason": "string | null",
  "customer_explanation": "string",
  "change_order_structure_suggested": "string | null",
  "admin_review_required": boolean
}
```

---

### 4. NOVA — Workflow Agent

**Purpose:** Orchestrate job lifecycle, detect stalls, fire reminders.

**Stall detection rules:**
- `offer_sent` with no response after 10 minutes → trigger reassign.
- `quote_submitted` with no approval after 30 minutes → send customer reminder.
- `in_progress` with no update after 4 hours → trigger admin alert.
- `completed_pending_confirmation` after 48 hours with no customer response → auto-confirm.

**Output contract:**
```json
{
  "current_status_valid": boolean,
  "recommended_next_action": "string",
  "automation_actions": ["string"],
  "reminder_targets": ["customer | provider | admin"],
  "stall_detected": boolean,
  "stall_severity": "low | medium | high | critical"
}
```

---

### 5. REX — Quality Agent

**Purpose:** Maintain provider trust scores and flag quality risks.

**Trust score components:**
| Component | Weight |
|---|---|
| Average customer rating | 35% |
| Completion rate (accepted / completed) | 20% |
| On-time arrival rate | 15% |
| Photo proof compliance | 10% |
| Cancellation rate | 10% |
| Dispute involvement rate | 10% |

**Score thresholds:**
- 90–100: Elite Provider (featured placement)
- 75–89: Verified Provider (standard)
- 60–74: Under Review (reduced job offers)
- 0–59: Suspension recommended

**Output contract:**
```json
{
  "trust_score": 0-100,
  "score_delta": number,
  "risk_level": "low | medium | high | critical",
  "quality_alerts": ["string"],
  "suspension_recommended": boolean,
  "warning_message_draft": "string | null"
}
```

---

### 6. IVY — Dispute Agent

**Purpose:** Analyze dispute evidence and recommend resolutions.

**Evidence inventory:**
- Full job timeline (status log)
- All messages (customer + provider)
- Quote and approval records
- Change order records
- Before/after photos
- Payment records

**Resolution options:**
- Full refund to customer
- Partial refund to customer
- Re-service with same provider
- Re-service with different provider
- Provider protection (full payout, dismiss dispute)
- Escalate to human mediator

**Output contract:**
```json
{
  "dispute_summary": "string",
  "evidence_timeline": [{ "timestamp": "string", "event": "string", "party": "string" }],
  "key_findings": ["string"],
  "resolution_recommendation": "full_refund | partial_refund | re_service | provider_protection | escalate",
  "refund_amount_suggested": "number | null",
  "confidence": "low | medium | high",
  "admin_review_required": boolean
}
```

---

### 7. FINN — Finance Agent

**Purpose:** Monitor payment health, escrow state, and payout safety.

**Monitoring triggers:**
- Payment authorization failure
- Escrow held > 7 days without job completion
- Payout to provider flagged by Stripe risk
- Unusual refund pattern (same provider, multiple refunds in 30 days)

**Output contract:**
```json
{
  "payment_status": "healthy | at_risk | failed",
  "payout_recommendation": "release | hold | freeze",
  "hold_reason": "string | null",
  "refund_risk_flag": boolean,
  "reconciliation_notes": "string",
  "admin_action_required": boolean
}
```

---

### 8. LENA — Retention Agent

**Purpose:** Drive rebooking, subscriptions, and customer loyalty.

**Trigger conditions:**
- Job status transitions to `closed`.
- Seasonal service window approaching (e.g., HVAC tune-up before summer).
- Customer has no booking in last 90 days.
- Provider has capacity available.

**Output contract:**
```json
{
  "rebooking_recommended": boolean,
  "recommended_service": "string | null",
  "recommended_timing": "string | null",
  "subscription_offer": "string | null",
  "customer_message_draft": "string",
  "channel": "email | sms | in_app"
}
```

---

### 9. TESS — Territory Agent

**Purpose:** Monitor market health and guide expansion decisions.

**Data sources:** Job request volume by ZIP, provider acceptance rates by ZIP, average match time by territory, category demand by area.

**Output contract:**
```json
{
  "territory_health_score": 0-100,
  "supply_demand_ratio": number,
  "underserved_zips": ["string"],
  "overserved_categories": ["string"],
  "provider_shortage_categories": ["string"],
  "expansion_recommendation": "string | null",
  "priority_level": "low | medium | high"
}
```

---

### 10. GABRIEL — Governance Agent

**Purpose:** Policy enforcement, compliance checks, and audit trail.

**Validation rules enforced:**
- No payout to provider on disputed job.
- No job offer sent to suspended provider.
- No quote approval without customer confirmation.
- No change order work without authorization.
- Provider licensing required for regulated categories (electrical, HVAC).
- All agent recommendations logged before application.

**Output contract:**
```json
{
  "governance_score": 0-100,
  "compliance_status": "compliant | warning | violation",
  "violations": ["string"],
  "blocked_actions": ["string"],
  "audit_entry": {
    "agent": "string",
    "action": "string",
    "approved": boolean,
    "reason": "string"
  }
}
```

---

## Agent Invocation Patterns

### Pattern 1: Sequential Chain
Used for the core booking flow.
```
ALICE → MAX → NOVA → QUINN → FINN → LENA
```

### Pattern 2: Parallel Trigger
Multiple agents fire on the same event independently.
```
job_completed event →
  ├── REX (update trust score)
  ├── FINN (queue payout)
  ├── LENA (schedule rebooking message)
  └── NOVA (confirm workflow complete)
```

### Pattern 3: Dispute Pipeline
Sequential with high human review requirements.
```
dispute_opened →
  NOVA (pause payout) →
  IVY (analyze evidence) →
  GABRIEL (validate recommendation) →
  Admin review (required) →
  FINN (execute resolution)
```

---

## Prompt Engineering Standards

All agent system prompts follow this structure:

```
[AGENT IDENTITY]
You are [NAME], the [Role] agent for VeloCity Field Service.

[DOMAIN CONTEXT]
VeloCity is an AI-powered field service platform. [2–3 sentences of context.]

[YOUR RESPONSIBILITIES]
1. [Responsibility 1]
2. [Responsibility 2]
...

[RULES]
- Always respond in valid JSON matching the output schema.
- Never hallucinate pricing data — only use provided benchmarks.
- When confidence is low, set admin_review_required: true.
- Do not recommend irreversible actions without high confidence.

[OUTPUT SCHEMA]
Respond only with a JSON object matching this exact schema:
{ ... }
```

**Model settings (all agents):**
- Temperature: 0.2 (deterministic, consistent outputs)
- Max tokens: 1,000
- Model: claude-sonnet-4-20250514

---

## Evaluation & Monitoring

### Per-Agent Monitoring
- Invocation count / day
- Average latency (P50, P95)
- Error rate (failed JSON parse, API errors)
- `admin_review_required` rate (proxy for confidence)
- Human override rate (admin disagreed with recommendation)

### Outcome-Based Evaluation
- MAX: Did the dispatched provider complete the job? Accept rate?
- QUINN: Were flagged quotes actually overcharged (admin confirmed)?
- IVY: Did dispute resolutions result in re-disputes?
- LENA: Did sent rebooking offers convert?
- REX: Correlation between trust score and future job outcomes?

### Monthly AI Review
- Review agent override rates — if > 20%, retune system prompt.
- Review high-confidence failures — false positives in GABRIEL blocks.
- Update pricing benchmarks for QUINN (monthly market data pull).

---

## Roadmap

| Phase | AI Additions |
|---|---|
| MVP | ALICE, MAX, NOVA active |
| Phase 2 | All 10 agents active; GABRIEL governance live |
| Phase 3 | Real-time voice intake (ALICE voice mode); Predictive demand model (TESS ML layer); Provider coaching recommendations (REX) |
| Phase 4 | Custom fine-tuned models on VeloCity job data; Multi-agent collaborative reasoning for complex disputes |

---

*Strategy maintained by Zenith AI. Questions → hello@zenith-ai.co*
