# E2E User Journey Certification (Platform Certification Batch, Phase 2)

Three journeys certified by tracing real code paths (handlers, agents, tables) end-to-end. This is static/code-path certification, consistent with the methodology used in `EXPANSION_INTELLIGENCE_E2E_VALIDATION.md` and `MEMBERSHIP_ENGINE_E2E_VALIDATION.md` — no live traffic was generated in this sandbox. See "What was not validated" at the end of each journey.

## Journey 1: Customer → Booking → Dispatch → Provider → Quote → Payment → Review → Follow-up

| Step | Trigger | Code path | Evidence |
|---|---|---|---|
| Booking | Customer submits job via app | `POST /api/jobs` inserts `jobs` row, emits `service_request_created` | `src/lib/automation/emitEvent.ts` |
| Intake/serviceability | `service_request_created` | `router.ts` → `handleAliceIntake` → `runAgent("ALICE", …)` classifies, updates `jobs.ai_classification`/`status`, emits `serviceability_passed` or `serviceability_failed` | `src/lib/automation/handlers/alice-intake.ts:20-60` |
| Dispatch | `serviceability_passed` (chained to `provider_offer_sent` family) | `router.ts` → `handleProviderOffer` + `handleMaxDispatch` → `runAgent("MAX", …)` ranks eligible `providers` (status=approved, is_online, category match) and sends offers; if none eligible, notifies customer and emits `no_provider_accepted` | `src/lib/automation/handlers/max-dispatch.ts:24-60` |
| Provider acceptance | Provider accepts offer | `job_accepted` → `router.ts` → `handleNovaWorkflow` → `runAgent("NOVA", …)` validates the transition, notifies customer/provider | `src/lib/automation/handlers/nova-workflow.ts:14-60` |
| Quote | Provider submits a quote | `POST /api/quotes` synchronously calls `quinn.reviewQuote()`, writes `quinn_analysis` into `quotes.metadata`; on customer approval `quote_approved` is emitted | `src/app/api/quotes/route.ts:78-85` |
| Payment | `quote_approved` | `router.ts` chains to `handleFinnPayment` → captures payment, computes platform fee via `platformFeePercent()`, writes `payments`/`revenue_records` | `src/lib/automation/handlers/finn-payment.ts` |
| Completion | Provider marks job complete / customer confirms | `job_completed`/`customer_confirmed` → `router.ts` → `handleRexCompletion` (trust score update, `provider_skills`/`provider_certifications` maintenance) + `handleNovaWorkflow` (status transition, customer notification) | `src/lib/automation/handlers/rex-completion.ts`, `nova-workflow.ts` |
| Review | Customer submits review | `POST /api/reviews` synchronously calls `rex.analyzeReview()` for authenticity/sentiment, writes to `reviews` insert payload | `src/app/api/reviews/route.ts:32-51` |
| Payout | Payment captured | Cron `/api/cron/automation` (every 5 min) polls captured/escrowed payments, emits `payout_queued`; `handlePayoutRelease` + `handleFinnPayment` process via Stripe transfer with 3-attempt retry | `src/lib/automation/handlers/payout-release.ts`, `src/app/api/cron/automation/route.ts:129-145` |
| Follow-up | Daily cron | `/api/cron/daily` emits `retention_campaign` → `handleLenaRetention` → `runAgent("LENA", …)` recommends rebook/churn action, writes to `notifications` if a campaign should be sent | `src/lib/automation/handlers/lena-retention.ts:61-82` |
| Dispute (exception path) | Customer opens dispute | `POST /api/disputes` synchronously calls `ivy.analyzeDispute()` against `buildEvidenceBundle()`, freezes payout, writes `disputes.ai_recommendation` | `src/app/api/disputes/route.ts:27-50`, `src/lib/automation/handlers/ivy-dispute.ts` |

**Governance**: every event in this chain, regardless of outcome, is audited by GABRIEL into `agent_logs` (`router.ts:272-282`) — this is the platform-wide audit trail for the journey.

**Status: CERTIFIED ✅** — every step has a real, traceable code path from a real trigger to a real table write or agent call; no step is a stub or placeholder.

## Journey 2: Membership Customer → Subscription → Scheduled Service → Renewal → Revenue Tracking

| Step | Trigger | Code path | Evidence |
|---|---|---|---|
| Subscription | Customer subscribes to a plan | `createMembershipSubscription()` is the sole write path into `membership_subscriptions`/`membership_entitlements` | `src/lib/membership/membershipLifecycle.ts:25-66` |
| Scheduled service | Entitlement consumed via a booking | `recordMembershipUsage()` links `jobs.membership_subscription_id` to `membership_usage`, decrementing the entitlement | `src/lib/membership/membershipLifecycle.ts:166-196` |
| Due-service detection | Daily cron | `/api/cron/daily` calls `emitDueMembershipServices()` which finds entitlements due and emits `subscription_due` → `handleMembershipLifecycle` | `src/app/api/cron/daily/route.ts`, `src/lib/membership/membershipLifecycle.ts:197-223` |
| Renewal | Daily cron / billing cycle | `emitExpiringMemberships()` finds subscriptions nearing `end_date`, emits `membership_expiring`; `renewMembershipSubscription()` is the sole write path for renewal, `flagRenewalFailed()` for failed renewal | `src/lib/membership/membershipLifecycle.ts:67-135,224-260` |
| Revenue tracking | Renewal/usage events | `computeRecurringRevenueIntelligence()` (FINN) reads `revenue_records` filtered by `membership_subscription_id` to compute MRR/ARR/renewal-rate/churn-rate at read time — no second ledger | `src/lib/membership/membershipRevenueIntelligence.ts:33-90` |
| Retention signal | Renewal/cancellation | `computeMembershipRetentionIntelligence()` (ALICE, Batch X+2) surfaces at-risk/inactive members from the same tables, displayed in Command Center | `src/lib/membership/membershipRetentionIntelligence.ts:57+` |

**Status: CERTIFIED ✅** — traceability chain Customer → Subscription → Entitlement/Usage → Booking → Revenue Record is unbroken and single-writer at every link.

## Journey 3: Commercial Customer → Account Creation → Commercial Booking → Dispatch → Completion → Billing → Reporting

| Step | Trigger | Code path | Evidence |
|---|---|---|---|
| Account creation | Admin/Sales onboards a commercial customer | `createCommercialAccount()` + `addCommercialLocation()`/`createCommercialContract()`/`addCommercialServicePlan()`/`addCommercialContact()` — single write path | `src/lib/commercial/commercialAccountLifecycle.ts` |
| Commercial booking | Job created against the account | Standard `jobs` insert with `commercial_account_id`/`commercial_contract_id` populated via `recordCommercialJobUsage()` | `src/lib/commercial/commercialAccountLifecycle.ts` (`recordCommercialJobUsage`) |
| Dispatch | `serviceability_passed` → MAX dispatch | Same `handleMaxDispatch` path as Journey 1, narrowed first by `assessCommercialDispatchPriority()` (MAX) which filters by SLA/certification-tier/active-load before the 5-factor `match()` ranking runs | `src/lib/commercial/commercialDispatchIntelligence.ts`, `src/lib/agents/max.ts` |
| Completion | `job_completed` | Same `handleRexCompletion`/`handleNovaWorkflow` path as Journey 1 — no separate commercial completion path (by design, per Rule 1/2 — no duplicate dispatch/completion system) | `src/lib/automation/handlers/rex-completion.ts` |
| Billing | Payment captured against the commercial job | Same `handleFinnPayment` path; `revenue_records.commercial_account_id` is set via `recordCommercialJobUsage()`, completing the traceability chain | `src/lib/commercial/commercialAccountLifecycle.ts` |
| Reporting | Read-time | `computeCommercialAccountSummary()` (per-account) and `computeCommercialRevenueIntelligence()` (platform-wide: attainment, at-risk contracts, renewal pipeline) — both read-only, both surfaced in Command Center and the customer dashboard's "My Commercial Account" section | `src/lib/commercial/commercialAccountSummary.ts`, `src/lib/commercial/commercialRevenueIntelligence.ts` |

**Status: CERTIFIED ✅** — commercial bookings reuse the exact same dispatch/completion/payment machinery as standard bookings, narrowed (not replaced) by commercial-specific logic, with full account→contract→plan→booking→revenue traceability.

## What was not validated (all three journeys)

- No live Supabase environment was exercised in this sandbox; no real job was created, dispatched, quoted, paid, reviewed, or disputed end-to-end against a running database.
- No live cron execution was observed; cron wiring is verified by reading `vercel.json` and the route handlers, not by triggering Vercel's scheduler.
- No live Stripe payment/payout was processed; Stripe calls in `finn-payment.ts`/`payout-release.ts` are verified by code inspection only.
- Latency for any step in these journeys is not measured here — see `PERFORMANCE_BASELINE.md` (Phase 8) for what could and couldn't be measured in this environment.
