# Pricing and Payments Automation

## Pricing Formula

Final price is calculated as:

`base price + labor adjustment + materials estimate + urgency adjustment + location adjustment + complexity adjustment + surge adjustment + platform fee`

Every pricing result returns:

- pricing mode
- base price
- labor/material/urgency/location/complexity/surge adjustments
- platform fee
- diagnostic fee
- required deposit
- final price
- customer explanation
- provider explanation
- risk flags
- confidence score

Pricing modes:

- `fixed_price`
- `diagnostic_fee`
- `quote_after_inspection`
- `deposit_plus_balance`
- `subscription_recurring`
- `emergency_dynamic`

Emergency pricing is capped. Adjustments are surfaced in the customer/provider explanations.

## Quote Validation

Provider quotes are compared to the deterministic pricing engine. QUINN can review with AI when configured, and deterministic fallback validation still creates structured pricing decisions.

Events:

- `quote_submitted`
- `quote_validated`
- `quote_flagged`
- `quote_approved`
- `quote_rejected`

Pricing decisions are written to `pricing_decisions` with `tenant_id`.

## Payment States

- `payment_required`
- `deposit_authorized`
- `deposit_captured`
- `balance_required`
- `balance_authorized`
- `paid`
- `payout_pending`
- `payout_hold`
- `payout_released`
- `refund_pending`
- `refunded`
- `payment_failed`
- `chargeback_opened`

## Payment Flows

- Fixed price: customer pays full amount upfront.
- Diagnostic: customer pays diagnostic fee first; fee can be credited toward final quote.
- Deposit + balance: deposit before dispatch, balance after quote approval or completion.
- Emergency: payment preauthorization before dispatch.
- Subscription: recurring billing for cleaning, lawn, and HVAC maintenance.

When Stripe keys are missing, local-dev payment intents are generated and financial events remain auditable.

## Stripe Webhooks

Handled events:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `transfer.created`
- `transfer.failed`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Each supported webhook updates payment-related records, emits automation events, and writes ledger rows where applicable.

## Payout Rules

- Do not release payout if a dispute is open.
- Do not release payout if job is not completed/customer-confirmed.
- Queue payout after completion.
- Hold payout when dispute opens.
- Release payout when eligible.
- Retry failed payout up to three times.

Events:

- `payout_queued`
- `payout_hold`
- `payout_released`
- `payout_failed`
- `payout_retry_scheduled`
- `refund_issued`
- `chargeback_opened`

## Database

Additive migration:

- `supabase/migrations/007_pricing_payments_automation.sql`

Tables:

- `pricing_decisions`
- `payment_ledger`
- `payout_ledger`
- `refund_records`
- `payment_retries`
- `subscription_events`

All tables include `tenant_id` and RLS should be reviewed before live use.

## QA Checklist

- Fixed price job paid upfront
- Diagnostic fee then final quote
- Deposit then balance
- Emergency pricing cap
- Quote flagged as too high
- Payment failed then retried
- Job completed then payout queued
- Dispute opens then payout held
- Dispute resolved then partial refund
- Payout fails then retries
- Stripe missing keys fallback
- Tenant isolation for payment/pricing/payout rows

Live payment automation is not `VERIFIED` until Stripe and Supabase live proof passes.
