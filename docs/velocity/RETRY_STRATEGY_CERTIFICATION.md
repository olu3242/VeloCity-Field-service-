# Retry Strategy Certification (Remediation & Go-Live Hardening Batch, Phase 4)

## Prior state

`src/lib/automation/worker.ts` set `automation_queue.available_at = now + retry_count * 60_000` on failure — a linear backoff of 1, 2, then 3 minutes before the item is marked `failed` after the 3rd attempt (`RISK_REGISTER.md` #2, `AUTOMATION_FABRIC_CERTIFICATION.md`).

## Evaluation

| Strategy | Behavior at retry 1/2/3 | Tradeoff |
|---|---|---|
| Linear (prior) | 1m / 2m / 3m | Fast to retry, but every queue item failing at the same time (e.g. a third-party API outage) retries in lockstep — all items hit the dependency again at the same moment, repeatedly, which is the worst case for a systemic failure |
| Exponential (no jitter) | 1m / 2m / 4m | Spreads retries out over time, but every item still retries in lockstep with every other item that failed at the same moment — same thundering-herd risk, just at wider intervals |
| **Exponential + full jitter (chosen)** | random(0, 1m) / random(0, 2m) / random(0, 4m) | Same backing-off behavior as exponential, but randomizing within the window decorrelates retries across items that failed together — a third-party outage no longer produces synchronized retry storms against the same dependency |

`automation_queue` already has a 3-attempt cap (unchanged) before an item is marked `failed` and surfaced via `/admin/automation`'s "Retry Now" button — this batch does not change that ceiling, only the spacing between attempts.

## Decision

**Exponential backoff with full jitter**, capped at 15 minutes, was implemented as the standard automation retry strategy. Full jitter (`Math.random() * exponentialWindow`) was chosen over exponential-without-jitter because the platform's actual failure mode of concern — described directly in `RISK_REGISTER.md` #7 — is a single misbehaving third-party integration causing many queue items to fail at once; jitter is the specific mechanism that prevents those items from retrying in a synchronized wave against the still-recovering dependency.

## Implementation

`src/lib/automation/worker.ts`:

```ts
const BASE_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;

function retryDelayMs(retryCount: number): number {
  const exponential = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (retryCount - 1));
  return Math.floor(Math.random() * exponential);
}
```

`available_at` is now set to `new Date(Date.now() + retryDelayMs(retryCount)).toISOString()` in place of the prior `retryCount * 60_000`. The 3-attempt cap, the `automation_runs` per-attempt audit row, and the `/admin/automation` failure surface are all unchanged — this is purely a timing-formula change to an existing mechanism, not a new retry framework.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` pass with this change. No schema change was required — `available_at` was already a `timestamptz` column written by the worker on every failure path.

**Status: CERTIFIED ✅** — retry backoff is now exponential with full jitter, addressing the lockstep-retry risk the linear schedule carried; the 3-attempt cap and failure-surfacing mechanism are unchanged and remain correct.
