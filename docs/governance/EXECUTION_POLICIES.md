# VeloCity Execution Policies

## Policy Definitions

Policies are defined in `src/lib/governance/policies.ts` as `AutomationPolicy[]`.

Each policy has:
- `id` — unique identifier
- `scope` — `global | tenant | agent | event_type`
- `enabled` — toggle without code deploy
- `rules` — array of `PolicyRule` with type + config

---

## Active Policies

### `dispute-auto-resolution-rate-limit`
**Scope:** tenant | **Type:** rate_limit

Limits automatic dispute resolutions to 5 per tenant per hour.

Rationale: High-volume auto-resolution without review increases refund risk and reduces dispute quality. Forces periodic human review at scale.

Config: `{ limit: 5, window: "1h", per: "tenant" }`

---

### `payout-daily-cap`
**Scope:** tenant | **Type:** rate_limit

Limits auto-released payout value to $50,000 per tenant per day.

Rationale: Large payout batches without review expose platform to fraud and reconciliation errors. Threshold set at 10× average daily payout.

Config: `{ limit_cents: 5000000, window: "24h", per: "tenant" }`

---

### `provider-suspension-requires-approval`
**Scope:** global | **Type:** require_approval

Provider suspension actions always require admin approval. No automated suspension executes without human sign-off.

Rationale: Suspension impacts provider livelihood and exposes platform to legal risk. Human oversight is mandatory.

Config: `{ approval_level: "admin", min_approvers: 1 }`

---

### `fraud-escalation-immediate`
**Scope:** global | **Type:** block + notify_admin

Fraud signals trigger immediate block + admin notification. No delay, no retry queue.

Rationale: Any delay in fraud response increases platform exposure. Speed is critical; human review follows block.

Config: `{ notify_channels: ["email", "dashboard"], block_account: true }`

---

### `retry-governance`
**Scope:** global | **Type:** throttle

Max 3 retries per queue item. Backoff: retry_count × 60 seconds.

Rationale: Prevents runaway retry loops from a broken handler or downstream service from flooding the queue.

Config: `{ max_retries: 3, backoff_multiplier_ms: 60000 }`

---

### `ai-execution-rate-limit`
**Scope:** tenant | **Type:** rate_limit

Max 100 Anthropic API calls per minute per tenant.

Rationale: Prevents cost explosion from event storms or misconfigured triggers. Protects shared Anthropic rate limit budget.

Config: `{ limit: 100, window: "1m", per: "tenant" }`

---

## Policy Query API

```typescript
import { getPoliciesForEvent, isPolicyEnabled } from "@/lib/governance/policies";

// Get all active policies for a given event type
const policies = getPoliciesForEvent("dispute_opened");

// Check if a specific policy is enabled
const enabled = isPolicyEnabled("provider-suspension-requires-approval");
```

---

## Adding New Policies

1. Add policy definition to `DEFAULT_POLICIES` in `policies.ts`
2. Implement enforcement in the appropriate governance check function
3. Add to this document with rationale
4. Write automated test for the policy rule
5. Deploy — policies take effect immediately (no migration needed for in-memory policies)

---

## Policy Override Procedure

Policies can be overridden by admin users via:

```
POST /api/admin/runtime
{ action: "operator_override", policy_id: "...", reason: "..." }
```

All overrides are audit-logged with actor_id and timestamp.
