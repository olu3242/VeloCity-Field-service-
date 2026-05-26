# VeloCity AI Explainability

## Principle

Every AI decision on the VeloCity platform must be:
1. **Traceable** — linked to the event and context that produced it
2. **Auditable** — recorded with agent name, input, and output
3. **Explainable** — structured output includes reasoning, confidence, and key factors
4. **Overridable** — any AI recommendation can be rejected by a human operator

---

## How AI Decisions Are Explained

### Structured Output

Every agent returns structured JSON with an explanation component:

**IVY (Dispute Resolution):**
```json
{
  "recommendation": "refund_customer",
  "confidence": 0.87,
  "reasoning": "Provider no-show confirmed by customer photo + GPS data. Platform policy: full refund for no-shows.",
  "key_factors": ["no_show_confirmed", "customer_evidence_strong", "provider_no_response"],
  "evidence_assessment": {
    "customer_evidence_strength": "strong",
    "provider_evidence_strength": "weak"
  },
  "escalation_needed": false
}
```

**REX (Provider Trust):**
```json
{
  "trust_delta": -8,
  "flag": "quality_review_recommended",
  "reasoning": "Third dispute in 30 days. Pattern suggests systemic quality issue.",
  "recommended_actions": ["schedule_provider_coaching", "monitor_next_3_jobs"]
}
```

**QUINN (Quote Validation):**
```json
{
  "flagged": true,
  "adjustment_percent": -15,
  "reasoning": "Labor hours (8h) exceed typical HVAC tune-up range (2-4h) by 100%.",
  "risk_level": "high"
}
```

---

## Audit Trail

Every AI execution is written to `agent_logs`:

```sql
SELECT
  agent_name,
  action,
  input->>'message' AS prompt,
  output->'data'->'reasoning' AS reasoning,
  output->'data'->'confidence' AS confidence,
  tokens_used,
  latency_ms,
  created_at
FROM agent_logs
WHERE job_id = $1
ORDER BY created_at;
```

GABRIEL writes a parallel record to `audit_logs` for every processed event, creating a dual audit trail.

---

## Operator Override

AI recommendations are advisory. Operators override via:

1. **Admin dispute detail page** — approve/reject IVY recommendation with reason
2. **Runtime API** — `POST /api/admin/runtime { action: "operator_override", agent: "IVY", entity_id: "...", reason: "..." }`
3. **HITL approval flow** — human_approval workflow steps explicitly record the operator's decision

All overrides are written to `audit_logs` with `actor_id`, `action`, and `reason`.

---

## Explainability by Agent

| Agent | Explanation Fields | Confidence Provided? |
|---|---|---|
| IVY | reasoning, key_factors, evidence_assessment, escalation_reason | Yes |
| REX | reasoning, recommended_actions, trust_delta | Implicit (flag level) |
| QUINN | reasoning, flagged, adjustment_percent, risk_level | Implicit |
| GABRIEL | compliance_flags, screening_notes | Yes |
| MAX | match_factors, ranked_providers, dispatch_rationale | Yes |
| FINN | anomaly_flags, reconciliation_notes | Implicit |
| LENA | churn_reasoning, rebook_recommendation | Yes |
| TESS | market_signals, opportunity_rationale | Yes |
| ALICE | classification_reasoning, serviceability_rationale | Yes |
| NOVA | transition_rationale, blocking_conditions | Implicit |

---

## Fallback Explainability

When AI is unavailable (no API key, circuit open, rate limit), deterministic fallbacks activate. Fallback responses include `"isFallback": true` in the agent result — this is logged to `agent_logs` so operators can distinguish AI decisions from deterministic defaults.
