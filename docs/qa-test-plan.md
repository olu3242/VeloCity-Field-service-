# VeloCity QA Test Plan — Tip After Service

**Feature:** Tip After Service  
**Version:** 1.0  
**Last Updated:** 2026-05-05

---

## Test Environment Setup

| Requirement | Value |
|---|---|
| Stripe mode | Test keys (`sk_test_...`) |
| Supabase | Live or local via `supabase start` |
| Test card (success) | `4242 4242 4242 4242` |
| Test card (decline) | `4000 0000 0000 0002` |
| Test card (3DS) | `4000 0027 6000 3184` |

---

## TC-001 — Completed Job Shows Tip UI

**Preconditions:**
- Customer is authenticated
- Job exists with status `completed` or `customer_confirmed`
- Job has an assigned `provider_id`

**Steps:**
1. Navigate to `/dashboard/jobs/[id]`
2. Observe sidebar

**Expected:**
- `TipProvider` card renders below the Dispute button
- Preset buttons ($5, $10, $20, $50) are visible
- Custom amount input is visible
- Optional note textarea is visible
- "Send Tip" button is disabled until an amount is selected
- Footer text reads "100% goes directly to your provider. No platform fee."

**Not expected:**
- Tip card does NOT appear when job status is `in_progress`, `quote_submitted`, or any non-terminal status

---

## TC-002 — Tip Submission Success (Dev Fallback Mode)

**Preconditions:**
- Stripe keys are placeholder (dev mode)
- Job is `completed`
- No existing tip for this job/customer

**Steps:**
1. Select $20 preset
2. Enter note: "Amazing work, very professional!"
3. Click "Send Tip"

**Expected:**
- Button shows spinner ("Processing…")
- `POST /api/tips` returns `201` with `payment_status: "succeeded"`
- Tip card changes to confirmation state:
  - Green border
  - "Tip sent! $20.00"
  - Note displayed in italics
- Provider receives in-app notification: "You received a $20.00 tip! 🎉"
- `automation_events` row created with `event_type: "tip_submitted"`
- `automation_queue` row created with `status: "pending"`
- After queue processing: `automation_runs` row shows `status: "completed"`
- `audit_logs` row created with `action: "tip_submitted"`
- Agent logs created for GABRIEL, REX, FINN, LENA

---

## TC-003 — Tip Submission Success (Stripe Live Mode)

**Preconditions:**
- Stripe test keys configured (`sk_test_...`)
- Job is `completed`

**Steps:**
1. Select $50 preset
2. Click "Send Tip"
3. Stripe payment sheet appears
4. Enter test card `4242 4242 4242 4242`
5. Complete payment

**Expected:**
- `POST /api/tips` returns `requires_action: true` with `client_secret`
- Stripe payment sheet handles card input
- `PATCH /api/tips` called after Stripe confirms
- Tip record updated to `payment_status: "succeeded"`
- `stripe_payment_intent_id` stored in `provider_tips` table
- Automation event emitted

---

## TC-004 — Tip Submission Failure (Stripe Decline)

**Preconditions:**
- Stripe test keys configured
- Test card `4000 0000 0000 0002` (always declines)

**Steps:**
1. Select $10 preset
2. Complete Stripe payment sheet with decline card

**Expected:**
- Error message shown: "Payment failed" or card-specific error
- `provider_tips` record saved with `payment_status: "failed"` (if record was created)
- Provider does NOT receive notification
- Automation event NOT emitted (no succeeded tip)

---

## TC-005 — Duplicate Tip Prevention

**Preconditions:**
- Customer has already successfully tipped job X

**Steps:**
1. Navigate to same completed job
2. Observe tip card

**Expected:**
- Card shows confirmation state (already tipped) — NOT the form again
- `GET /api/tips?job_id=X` returns existing succeeded tip
- Attempting `POST /api/tips` with same `job_id` + `customer_id` returns `409 Conflict`
- Unique DB constraint (`idx_tips_one_per_job`) prevents duplicate rows

---

## TC-006 — Tip Blocked on Non-Completed Job

**Preconditions:**
- Job status is `in_progress` or `quote_submitted`

**Steps:**
1. Attempt `POST /api/tips` with this job's ID (via API, bypassing UI)

**Expected:**
- API returns `400 Bad Request`
- Error message: "Tips are only allowed on completed jobs. Current status: in_progress"
- No database record created
- No automation event emitted

---

## TC-007 — Cross-User Tip Prevention

**Preconditions:**
- Customer A owns job X
- Customer B is authenticated

**Steps:**
1. Customer B calls `POST /api/tips` with job X's ID

**Expected:**
- API returns `404 Not Found` ("Job not found or access denied")
- Supabase `.eq("customer_id", user.id)` filter rejects the query
- No tip record created

---

## TC-008 — Custom Amount Validation

**Steps:**
1. Enter `0.50` in custom amount field (< $1.00)
2. Click "Send Tip"

**Expected:**
- Client-side: button remains disabled (effectiveCents < 100)
- If bypassed to API: Zod validation returns `400` with "Minimum tip is $1.00"

**Steps:**
1. Enter `99999` in custom amount (> $10,000)

**Expected:**
- Zod validation returns `400` with "Maximum tip is $10,000"

---

## TC-009 — Provider Dashboard Shows Tips

**Preconditions:**
- Provider has at least one received succeeded tip

**Steps:**
1. Provider logs in, navigates to `/provider/dashboard`

**Expected:**
- "Tips Received 💝" card appears above job lists
- Total tips amount shown in top-right of card header
- Each tip shows amount, optional note, and date
- Tips section hidden when no tips received

---

## TC-010 — Provider Job Detail Shows Tip Badge

**Preconditions:**
- Tip received for job X
- Provider navigates to `/provider/jobs/X`

**Expected:**
- "💝 +$20.00 tip received" badge visible in earnings section
- Badge styled with rose/pink color

---

## TC-011 — Admin Dashboard Shows Tips Feed

**Preconditions:**
- At least one succeeded tip exists in the system

**Steps:**
1. Admin logs in, navigates to `/admin/dashboard`

**Expected:**
- "Recent Tips 💝" section visible below provider approvals
- Each row shows: amount, customer name → provider name, optional note, date
- Section hidden when no tips exist

---

## TC-012 — Automation Event Pipeline End-to-End

**Steps:**
1. Submit a tip (dev mode)
2. Call `POST /api/automation/process` (or wait for cron)

**Expected (in order):**
1. `provider_tips` row: `payment_status = "succeeded"`
2. `automation_events` row: `event_type = "tip_submitted"`, `status = "received"`
3. `automation_queue` row: `event_type = "tip_submitted"`, `status = "pending"`
4. After processing: `automation_queue.status = "completed"`
5. `automation_runs` row: `status = "completed"`, `duration_ms` populated
6. `notifications` row: provider notified
7. `agent_logs` rows: GABRIEL, REX, FINN, LENA all logged
8. `audit_logs` row: `action = "tip_submitted"`
9. If no review exists: customer receives review nudge notification

---

## TC-013 — Retry Failed Tip

**Preconditions:**
- `provider_tips` row exists with `payment_status = "failed"`

**Steps:**
1. Navigate to same completed job page
2. Observe tip card

**Expected:**
- "Tip payment failed" state shows with previous amount
- "Try again" button visible
- Clicking "Try again" clears failed state, shows fresh tip form
- Successful re-submission updates existing record (not creates new)

---

## TC-014 — Note Length Validation

**Steps:**
1. Enter a 501-character note in the tip form

**Expected:**
- `maxLength={500}` on textarea prevents typing past 500
- Character counter shows "500/500"
- If bypassed to API: Zod returns `400` with "Note must be 500 characters or fewer"

---

## Regression Checklist

After implementing tips, verify these existing flows still work:

- [ ] New job booking triggers ALICE classification
- [ ] Provider offer acceptance auto-rejects competing offers
- [ ] Quote approval creates payment intent
- [ ] Job state transitions fire GABRIEL governance
- [ ] Admin provider approval still works
- [ ] Automation queue processes normally
- [ ] SLA cron runs without errors
# QA Test Plan

This plan covers launch-critical QA for Velocity/JIT AI. Use it alongside `/admin/launch-readiness` and update `docs/production-readiness-audit.md` when flows pass or fail.

## Automated Checks

- `npm run type-check`
- `npm run lint`
- `npm run build`
- `npm run db:seed` after Supabase migration reconciliation

## Demo Account Verification

- Customer demo account can sign up, log in, and view only customer pages.
- Provider demo account can sign up, submit application data, and view provider pages after approval.
- Admin demo account can log in and access admin, growth, command center, and launch readiness dashboards.
- Google sign-up works after the provider is enabled in Supabase Auth.

## Customer Flow

- Customer signs up or logs in.
- Customer creates a service request with category, location, urgency, and notes.
- Intake classification uses ALICE when AI is configured.
- Intake classification falls back deterministically when AI is missing.
- Customer lands on a job status page.
- Customer approves or rejects a provider quote.
- Customer completes payment or local fallback payment path.
- Customer confirms completion and submits review.
- Customer can create a dispute.

## Provider Flow

- Provider applies.
- Admin approves provider.
- Provider views job offers.
- Provider accepts or rejects an offer.
- Provider updates valid workflow states only.
- Provider submits quote.
- Provider submits change order when required.
- Provider sees trust score, earnings forecast, and coaching tips.

## Admin Flow

- Admin views live jobs.
- Admin dispatches unassigned jobs manually or using MAX recommendations.
- Admin reviews provider approvals.
- Admin reviews disputes.
- Admin reviews payment and payout queue.
- Admin reviews AI recommendations and agent activity.
- Admin reviews growth, command center, and launch readiness dashboards.

## Payment QA

- Stripe payment intent creation works when Stripe keys are configured.
- Safe local fallback works when Stripe keys are missing.
- Webhook handler verifies Stripe signatures before updates.
- Deposit and final payment status update records.
- Disputes freeze payout.
- Completed jobs queue payout review.

## Notification QA

- In-app notifications are created.
- SendGrid email sends when configured.
- Twilio SMS sends when configured.
- Missing external keys fall back to in-app notification records.

## AI Agent QA

- ALICE intake logs recommendation.
- MAX dispatch logs ranking.
- QUINN quote review logs outcome.
- NOVA workflow monitor logs risk.
- REX provider coaching logs score.
- IVY dispute summary logs result.
- FINN payment review logs risk.
- LENA retention logs opportunity.
- TESS territory insights log recommendation.
- GABRIEL governance checks log audit output.

## Failure Capture

For each failed flow, capture:

- User role
- Route
- Request payload shape
- Error message
- Expected behavior
- Actual behavior
- Required fix
