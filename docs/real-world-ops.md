# Real-World Operations Layer

Velocity now has an additive operations layer for field proof, SLA visibility, job evidence, messaging, payment commitment, dispatch reliability, receipts, and dispute evidence.

## Architecture Summary

- Provider GPS check-ins are handled by `src/lib/location/*` and `POST /api/jobs/[id]/check-in`.
- Job evidence photos use Supabase Storage bucket `job-photos`, `job_photos`, and `src/lib/storage/*`.
- Job chat uses `job_messages`, `src/lib/messaging/*`, and `GET/POST /api/jobs/[id]/messages`.
- SLA calculations live in `src/lib/sla/*` and are displayed on customer, provider, and admin job details.
- Cancellation/no-show policy helpers live in `src/lib/policies/*` and emit auditable automation events when triggered.
- Dispatch now checks payment commitment and filters providers by availability, radius, and daily capacity before offers are sent.
- Receipts are generated from successful Stripe payment webhooks and stored in `receipts`.
- Dispute intake passes a structured evidence bundle to IVY using `src/lib/disputes/buildEvidenceBundle.ts`.

## Database

Additive migration: `supabase/migrations/008_real_world_ops.sql`

Tables:
- `job_checkins`
- `job_photos`
- `job_messages`
- `provider_availability`
- `provider_settings`
- `receipts`

Job columns:
- `dispatch_time`
- `accept_time`
- `arrival_time`
- `completion_time`
- `receipt_id`

Storage:
- `job-photos` bucket

## Enforcement Rules

- Providers must have an accepted/assigned job before check-in.
- Check-in validates GPS proximity when job coordinates are available.
- `in_progress` requires a valid arrival check-in and at least one `before` photo.
- `completed_pending_confirmation` requires at least one `after` photo.
- Admin dispatch is blocked with `402` unless the job has a deposit/payment authorization or emergency preauthorization.
- Customer bookings outside active service ZIPs are rejected unless admin override logic is used.
- Dispute evidence includes job timeline, photos, messages, check-ins, quotes, payments, and automation events.

## QA Checklist

| Scenario | Expected Result |
| --- | --- |
| Provider arrives and GPS is near job | `job_checkins` row is created, job arrival time is updated, `provider_arrived` is emitted. |
| Provider is too far from job | Check-in API returns `400`, no check-in row is created. |
| Provider starts work without before photo | Transition to `in_progress` returns `409`. |
| Provider completes without after photo | Transition to `completed_pending_confirmation` returns `409`. |
| SLA timer counts down | Customer, provider, and admin job pages show arrival SLA status. |
| Provider late | SLA status shows warning/breach and automation can emit `sla_warning`/`sla_breach`. |
| Customer/provider/admin sends message | `job_messages` row is created and visible on job detail pages. |
| Customer cancels after provider accepts | Cancellation policy can apply a fee and emit `cancellation_fee_applied`. |
| Provider no-show | Policy helper returns penalty/reassignment recommendation. |
| Dispatch without payment commitment | `/api/admin/dispatch` returns `402` and writes an audit log. |
| Provider availability exists | MAX fallback matching filters unavailable, out-of-radius, or over-capacity providers. |
| Payment succeeds | Stripe webhook creates receipt and links it to the job when job metadata is available. |
| Dispute opens | IVY receives the full evidence bundle and `dispute_opened` includes evidence metadata. |

## Remaining Live Proof Needed

- Apply `008_real_world_ops.sql` manually after reviewing migration ordering because local and remote migration histories diverged earlier.
- Verify Supabase Storage policies against the linked project.
- Seed provider availability/settings rows for demo providers.
- Run a live check-in/photo/message/transition chain with seeded users before marking this layer VERIFIED.
