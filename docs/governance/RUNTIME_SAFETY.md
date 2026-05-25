# VeloCity Runtime Safety

## Safety Controls Overview

```
Event arrives at router
       ↓
┌─────────────────────────────────┐
│  DEDUP CHECK                    │  Block same event processed twice in 30s
│  FLOOD PROTECTION               │  Max 60 events/min per tenant+eventType
│  RUNAWAY LOOP DETECTION         │  Max 10 same job+event per hour
│  CIRCUIT BREAKER                │  Open after 5 consecutive handler failures
│  OPERATOR PAUSE                 │  Admin-initiated full runtime halt
└─────────────────────────────────┘
       ↓
Handler executes (if all checks pass)
```

All checks are **in-memory**, **synchronous**, and add <1ms latency.

---

## 1. Deduplication

`checkDuplication(key: string, windowMs = 30_000)`

Prevents processing the same event twice within a 30-second window. Uses the event's `dedup_key` (usually `{event_type}:{entity_id}:{timestamp_bucket}`).

**When triggered:** Same webhook fired twice by upstream system, double-click on UI action, network retry delivering duplicate.

**Response:** `{ allowed: false, reason: "Duplicate event within dedup window" }`

---

## 2. Flood Protection

`checkFloodProtection(tenantId, eventType, limitPerMinute = 60)`

Limits events per tenant+eventType to 60/minute. Uses sliding 60-second window with in-memory counter.

**When triggered:** Webhook storm from Stripe, runaway cron job, misconfigured event emitter.

**Response:** `{ allowed: false, reason: "Rate limit exceeded for {eventType}" }`

Counters reset after 60 seconds. Blocked events are not dropped — they should be re-queued after the window.

---

## 3. Runaway Loop Prevention

`checkRunawayLoop(jobId, eventType, maxPerHour = 10)`

Detects when the same job+eventType combination fires more than 10 times per hour. This catches automation feedback loops (e.g., a handler re-emitting the event that triggered it).

**When triggered:** Handler emits same event it was triggered by, retry logic creating positive feedback, misconfigured workflow.

**Response:** `{ allowed: false, reason: "Runaway loop detected for {jobId}:{eventType}" }`

---

## 4. Circuit Breaker

`isOpen(key: string)` — key format: `"{agentName}:{eventType}"` or `"{handlerName}"`

Opens after 5 consecutive failures. Stays open for 60 seconds. Then enters `half-open` — allows one test execution. If it succeeds, circuit closes. If it fails, reopens for another 60 seconds.

**States:**
- `closed` — normal operation
- `open` — all executions blocked, return error immediately
- `half-open` — one probe allowed, outcome determines next state

**Manual reset:** `POST /api/admin/runtime { action: "reset_circuit", circuit_key: "..." }`

---

## 5. Operator Runtime Pause

`isRuntimePaused()` — Admin-controlled global halt.

When paused:
- All queue processing stops
- In-flight handlers complete
- New events are queued (not dropped)
- Resume restores normal processing

**How to pause:** `POST /api/admin/runtime { action: "pause_runtime", reason: "Investigating payout anomaly" }`

**How to resume:** `POST /api/admin/runtime { action: "resume_runtime" }`

Both actions write to `audit_logs`.

---

## 6. Webhook Storm Protection

Stripe, Supabase realtime, and other webhooks can create event bursts. The flood protection layer (above) handles per-tenant rate limiting. Additionally:

- The `automation_queue` dedup_key unique constraint prevents DB-level duplicate inserts
- The `available_at` column ensures immediate replay doesn't re-process before the retry window

---

## Safety State Reset on Restart

All safety state is in-memory. On server restart:
- Dedup window clears (30s window is short; acceptable)
- Flood counters reset (60s window; some events may re-process)
- Loop counters reset (1h window; monitor for loops manually after restart)
- Circuit breakers reset to closed (desirable — clear failures on deploy)

**Mitigation for restart resets:** The queue's `dedup_key` unique constraint provides DB-level deduplication as a backstop. In-memory safety is the fast path; DB constraints are the safety net.

---

## Production Hardening Checklist

- [ ] Flood protection limit tuned per tenant traffic profile
- [ ] Circuit breaker threshold validated against handler error rates
- [ ] Runaway loop limit validated against max legitimate retry frequency
- [ ] Admin team trained on pause/resume procedure
- [ ] Monitoring alert: flood protection triggered >5 times in 1 hour
- [ ] Monitoring alert: circuit breaker opens for any handler
- [ ] On-call runbook: what to do when circuit breaker opens on IVY or FINN
