# Object Governance Model

## Object List

Governed objects include tenants, profiles/users, customers, providers, provider documents, provider availability, service areas, services/categories, jobs/bookings, job events, check-ins, photos, messages, provider offers, quotes, quote line items, change orders, payments, payment ledger, payout ledger, disputes, dispute evidence, reviews, automation events, automation queue, agent logs, pricing decisions, and receipts.

## Formula Fields

Formula fields are implemented in `supabase/migrations/009_formula_validation_views.sql` as SQL views:

- `velocity_job_formula_view`: job age, time-to-accept, time-to-arrive, time-to-complete, overdue, emergency, disputed, payment/payout labels, health score, SLA status.
- `velocity_provider_formula_view`: active jobs, completed jobs, cancellation/on-time signals, average rating, trust label, availability, document compliance, payout holds.
- `velocity_customer_formula_view`: completed jobs, dispute rate, lifetime value, last booking date, churn risk.
- `velocity_quote_formula_view`: quote total, materials/labor totals, platform fee, expected provider payout, fairness label, admin-review flag.
- `velocity_payment_formula_view`: net platform revenue, provider payout, refunds, failed payment, payout blocked flag.
- `velocity_dispute_formula_view`: dispute age, evidence count, payment hold, resolution SLA, IVY recommendation.
- `velocity_automation_formula_view`: queue age, retry status, stuck flag, automation health.
- `velocity_agent_log_formula_view`: confidence label, human-review flag, run duration.

## Validation Rules

Database validation is additive and tenant-aware:

- Required tenant and job address checks are enforced during job status changes.
- Providers cannot go online unless approved.
- Providers cannot be approved without verified/approved documents or legacy document JSON.
- Jobs cannot move to `arrived` without GPS check-in.
- Jobs cannot move to `in_progress` without arrival check-in and before photo.
- Jobs cannot complete/close without after photo.
- Jobs cannot close while an active dispute exists.
- Payout ledger rows cannot move to `payout_released` while the job has an open dispute.
- Open disputes freeze payout ledger rows.
- Reviews are limited to one review per job/reviewer, and ratings remain 1-5.
- Automation queue retry count is capped at 3, and failed rows require an error message.

App validation is extended in `src/lib/validation.ts`:

- `jobCreateSchema`
- `jobTransitionSchema`
- `providerApprovalSchema`
- `providerAvailabilitySchema`
- `quoteSubmitSchema`
- `changeOrderSchema`
- `paymentIntentSchema`
- `disputeCreateSchema`
- `reviewCreateSchema`
- `automationProcessSchema`
- `agentRunSchema`
- `messageCreateSchema`
- `checkInSchema`
- `photoUploadSchema`

## Related Lists

Reusable related-list components live in `src/components/related-lists/`.

They support tenant-aware queries, limit/offset pagination props, status badges, empty states, error states, created-at sorting, quick action links, and optional search filters.

Admin pages now use these list components for jobs, providers, customers, disputes, payments, automation, evidence, messages, photos, events, quotes, ledgers, payouts, and agent logs.

## Security / RLS Notes

- New governance tables include `tenant_id`.
- RLS policies allow tenant admins to manage governance objects.
- Provider document read access is scoped to the provider owner.
- Complex field/action permissions remain app-layer concerns; RLS focuses on tenant isolation and clear object ownership.
- Service-role automation must continue logging tenant IDs on every mutation.

## Launch-Critical Rules

- Dispatch must remain blocked without payment authorization where required.
- Work start must require GPS arrival and before photo.
- Completion must require after photo.
- Provider approval must require documents.
- Payout release must be blocked by active disputes.
- Automation retries must be bounded and error-bearing when failed.

## QA Checklist

| Test | Expected Result |
|---|---|
| Create job without tenant/customer/category/address | Blocked by app or DB validation. |
| Approve provider without docs | Blocked by DB trigger. |
| Dispatch without payment pre-auth | API returns `402`. |
| Move to arrived without GPS check-in | Blocked by DB trigger. |
| Start without before photo | API/DB blocks transition. |
| Complete without after photo | API/DB blocks transition. |
| Release payout with open dispute | DB trigger blocks update. |
| Refund greater than captured amount | Must be blocked by payment service logic before live launch. |
| Duplicate customer review | Unique review constraint blocks duplicate. |
| Process same automation twice | Worker/status logic must keep completed items from reprocessing unless manually retried. |

Live verification is still required before marking these rules VERIFIED in launch documentation.
