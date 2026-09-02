# Evidence Architecture Audit (Batch X, Phase 6)

Scope: every table recording execution evidence, audit trail, or operational log across all migrations. Read-only — no table is altered, merged, or dropped by this document.

## AUTHORITATIVE evidence tables (real write paths, single source of truth for their concern)

| Table | Concern | Authoritative write path | Read sites |
|---|---|---|---|
| `job_status_history` | Job state transitions | `src/app/api/jobs/[id]/transition/route.ts:147` — unconditional on every transition | Job detail pages |
| `agent_logs` | Every agent execution | `src/lib/agents/base.ts:86` (`BaseAgent.run()`, unconditional) | `command-center/page.tsx:134`, `automation/logs/page.tsx:23`, `admin/lax/page.tsx:97`, `admin/growth/page.tsx:34`, `launch-readiness/page.tsx:73` |
| `audit_logs` | Governance/policy/dispatch decisions | 14 write call sites incl. `router.ts:237,250`, `governance.ts:103`, `sla-check.ts` (3x), dispatch route | `runtime/trace/[id]/route.ts:36`, `command-center/page.tsx:140` |
| `automation_events` | "Did the event happen" (dedup-keyed) | `emitEvent.ts:41,49` | `runtime/trace/[id]`, `buildEvidenceBundle.ts:11`, `automation/logs/page.tsx:22`, `jobs/[id]/page.tsx:49` |
| `automation_queue` | "Will this event be processed" (retryable work unit) | `emitEvent.ts:67`, `worker.ts` (5 transition writes) | `automation/status/route.ts`, `drift-detector.ts`, `lax/page.tsx`, `command-center/page.tsx` |
| `automation_runs` | "Did the handler execute" (result log) | `worker.ts:42,62,82` | `automation/status/route.ts:32`, `contracts/health.ts:35`, `runtime/trace/[id]`, `lax/page.tsx:96` |
| `access_audit_logs` | Permission-check outcomes | `src/lib/access/checkPermission.ts:29`, unconditional | `admin/settings/page.tsx`, `command-center/page.tsx:140`, `settings/audit/page.tsx` |
| `pricing_decisions` | AI pricing decisions | `src/app/api/quotes/route.ts:108` | `admin/pricing/page.tsx`, `command-center/page.tsx:137` |
| `payment_ledger` / `payout_ledger` / `refund_records` | Financial ledger entries | Stripe webhook route, `payments/intent/route.ts`, `payoutLedger.ts` | `admin/payments/page.tsx`, `admin/payouts/page.tsx`, `command-center/page.tsx:138-139` |

These nine tables form the platform's real evidence model. They are tenancy-aware, RLS-protected, and each has at least one unconditional or near-unconditional write path tied to a real user/system action.

## Dependency chain clarification (not duplicates)

`automation_events` → `automation_queue` → `automation_runs` look similar but represent three distinct stages of the same pipeline (immutable event log → retryable work unit → execution result), confirmed via call-site tracing. This is intentional separation of concerns, not architectural debt.

## LEGACY / DUPLICATE-RISK pairs (flagged, not changed)

| Pair | Finding | Recommendation |
|---|---|---|
| `job_status_history` vs `workflow_temporal_history` | `job_status_history` is the real, written-to job-transition log. `workflow_temporal_history` (migration 011) is a more generic "workflow event sequence" table with **zero write call sites anywhere in `src/`**. | Job transitions should continue to use only `job_status_history`. `workflow_temporal_history` is dead, not duplicated-into — it never received the writes it was designed for. Already covered as ORPHANED in `DATABASE_DECOMMISSION_AUDIT.md`. |
| `payment_ledger` vs `refund_records` vs `payout_ledger` | All three are financial ledgers with overlapping shape (amount/status/metadata) but distinct write paths (Stripe webhook, payment intent route, payout helper) and distinct entry semantics. | Not a true duplicate — each is the authoritative log for its own financial event type. A future (out-of-scope) refactor could unify them under one `entry_type`-discriminated ledger, but no functional risk exists today. |
| `audit_logs` vs `automation_events` | `audit_logs` records actions/decisions (actor_type enum); `automation_events` records system events with dedup semantics. | Not a duplicate — different keys (idempotency vs actor attribution) serve different consumers (`runtime/trace` vs Command Center failure feed). |

## ORPHANED evidence tables — zero write call sites anywhere in `src/`

19 tables across migrations 008-014 were confirmed to have full schema + RLS but no application writer:

- `settings_audit_logs` (008) — read-only consumer exists (`admin/settings/audit/page.tsx`), but nothing ever writes to it
- `dispute_evidence` (009) — zero reads and zero writes
- `ai_decision_lineage`, `execution_memories`, `workflow_snapshots`, `optimization_history`, `remediation_patterns` (010)
- `workflow_temporal_history` (011)
- `cognition_lineage`, `autonomous_actions_audit` (012)
- `runtime_trace_lineage`, `execution_ancestry_log`, `governance_overrides_log` (013)
- `orchestration_hardening_log`, `memory_federation_log`, `execution_economics_log`, `federation_governance_log` (014)

Cross-reference with `DATABASE_DECOMMISSION_AUDIT.md`: migrations 011/012/013 tables in this list match exactly the 18-table ORPHANED set already audited there. This Batch X sweep additionally surfaces orphaned evidence tables from migrations **008, 009, 010, and 014** — outside the original 011/012/013 scope. These are new findings, documented here for completeness; they are **not** added to the Decommission Plan's removal-candidate list in this batch, since that would require its own audit pass against migrations 008-010/014 with the same FK/trigger/view/cron rigor applied to 011-013, which has not been performed. Recommended as the starting scope for the next decommission audit (see Recommended Next Batch in the final readiness doc).

## Trust score finding

No `trust_logs` or `trust_score_history` table exists. `providers.trust_score` is a computed column updated via trigger (`update_provider_trust_score()`); an in-memory `TRUST_SCORES` map in `src/lib/trust/provider-trust.ts` exists but is not persisted. This is a gap (no historical trust audit trail) rather than a duplicate — noted as a risk in the final readiness doc, not fixed here (would be new feature work, against Rule 1).

## Conclusion

The platform's evidence model is **already single-sourced per concern**: one table per concern (job transitions, agent execution, governance/policy, access control, pricing, payments/payouts/refunds), each with exactly one authoritative writer. No consolidation is required among the 9 AUTHORITATIVE tables. The risk is entirely on the orphaned side: 19 tables (8 newly identified beyond the original 011-013 scope) exist with zero writers and represent the same disconnected-scaffolding pattern already documented for the 011-013 batch.
