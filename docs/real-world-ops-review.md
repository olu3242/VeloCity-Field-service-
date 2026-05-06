# Real-World Ops Review

Rubric:
- `SOLVED`: implemented, wired, and locally testable in code.
- `PARTIAL`: implemented or documented, but missing live proof or complete deployment wiring.
- `OPEN`: not implemented in code.

| Area | Status | Evidence File | Risk | Fix Needed | Launch Critical? |
|---|---|---|---|---|---|
| Provider GPS check-in | PARTIAL | `src/app/api/jobs/[id]/check-in/route.ts`, `src/lib/location/checkIn.ts` | Live Supabase RLS/storage proof still pending. | Apply `008_real_world_ops.sql` and test provider check-in with seeded user. | Yes |
| Job photo evidence | PARTIAL | `src/app/api/jobs/[id]/photos/route.ts`, `src/lib/storage/uploadJobPhoto.ts` | Supabase Storage bucket/policy must be verified remotely. | Apply storage bucket policy and upload before/after photos live. | Yes |
| SLA timers | SOLVED | `src/lib/sla/slaTimer.ts`, `src/lib/sla/slaStatus.ts`, admin/customer/provider job pages | SLA cron proof is separate from UI status proof. | Live cron proof before marking automation alerts verified. | Yes |
| In-app job messaging | PARTIAL | `src/app/api/jobs/[id]/messages/route.ts`, `src/lib/messaging/sendMessage.ts` | SMS fallback is not wired from message send. | Test customer/provider/admin chat live; add NOVA SMS fallback later if needed. | Yes |
| Cancellation/no-show engine | PARTIAL | `src/lib/policies/cancellationRules.ts`, `src/lib/policies/noShowDetection.ts` | No-show detection exists as policy logic but scheduled reassignment proof is pending. | Wire scheduled no-show detection to cron/automation proof chain. | Yes |
| Payment pre-auth enforcement | SOLVED | `src/app/api/admin/dispatch/route.ts`, `src/lib/payments/preAuth.ts` | Requires seeded/live payment rows to avoid blocking all dispatch. | Seed payment authorization for demo dispatch scenarios. | Yes |
| Provider availability | PARTIAL | `src/lib/providers/getAvailableProviders.ts`, `src/lib/providers/filterByAvailability.ts`, `src/lib/providers/filterByRadius.ts` | Provider availability/settings rows need seed/live proof. | Seed availability/settings and test dispatch matching. | Yes |
| Receipts/invoices | PARTIAL | `src/lib/finance/generateReceipt.ts`, `src/app/api/webhooks/stripe/route.ts` | Receipt creation depends on Stripe webhook proof. | Run Stripe test-mode payment success webhook. | Yes |
| Dispute evidence bundle | PARTIAL | `src/lib/disputes/buildEvidenceBundle.ts`, `src/app/api/disputes/route.ts`, `/admin/disputes/[id]` | Bundle is built and shown, but live dispute flow proof is pending. | Open dispute after photos/messages/check-ins exist. | Yes |
| Service area enforcement | SOLVED | `src/lib/geo/validateServiceArea.ts`, `src/app/api/jobs/route.ts` | Demo tenant needs active service areas seeded. | Verify booking inside/outside ZIP against seeded tenant. | Yes |

## Review Notes

- `008_real_world_ops.sql` must be applied before live proof because job check-ins, photos, messages, provider availability, settings, and receipts depend on the new tables.
- `009_formula_validation_views.sql` adds the governance hardening layer for formula views, validation constraints, and triggers. Apply it only after reviewing against the linked multi-tenant schema.
- Do not mark any area fully live-verified until Supabase migration, seeded user, route, and UI proof all pass in the linked tenant.
