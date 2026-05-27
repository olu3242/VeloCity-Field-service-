# VeloCity Field Service — Product Requirements Document (PRD)

**Version:** 1.0 — MVP  
**Status:** Active Development  
**Owner:** Zenith AI  
**Last Updated:** 2026

---

## 1. Executive Summary

VeloCity Field Service is an AI-powered local field service delivery platform that connects customers with verified local professionals for home and business service needs. The platform operates as a full-stack field service OS — not just a marketplace — with AI agents managing every step from intake to payout.

**Core value proposition:**
- Customers get trusted, trackable, on-demand local professionals.
- Providers get a full business operating system with dispatch, invoicing, and payments.
- Operators get AI-assisted command center visibility over every job, dollar, and dispute.

---

## 2. Problem Statement

The local home services market is fragmented, trust-deficient, and operationally manual. Key pain points:

**Customer side:**
- Finding trustworthy, verified local professionals is difficult and stressful.
- Pricing is opaque — surprise charges are common.
- No job tracking or accountability once a provider is booked.
- No consistent communication or dispute resolution process.

**Provider side:**
- Independent operators lack tools to manage scheduling, invoicing, and payments.
- Lead quality from existing platforms (Angi, Thumbtack) is inconsistent.
- No performance metrics or tools to build repeat business.

**Operator side:**
- Dispatching and coordinating field service teams is largely manual.
- SLA monitoring, dispute handling, and payout management are disconnected.
- No AI-native intelligence layer for decision support.

---

## 3. Goals & Success Metrics

### MVP Goals
- Launch with 6 core service categories in 1 market (San Antonio, TX — pilot city).
- Onboard 25+ verified providers in the first 30 days.
- Complete 200+ bookings in the first 60 days.
- Achieve a 4.7+ average service rating at launch.

### North Star Metric
**Gross Merchandise Value (GMV)** — total value of services completed on the platform.

### Supporting KPIs

| Metric | MVP Target |
|---|---|
| Jobs completed / month | 200+ |
| Provider acceptance rate | ≥ 70% |
| Quote approval rate | ≥ 80% |
| Average time to match (ATM) | ≤ 8 minutes |
| Customer NPS | ≥ 50 |
| Provider NPS | ≥ 45 |
| Dispute rate | ≤ 3% of jobs |
| Platform take rate | 18–22% |

---

## 4. Target Users

### 4.1 Customers
- Homeowners 28–55 years old in suburban and urban markets.
- Seeking fast access to trustworthy local professionals.
- Comfortable booking services digitally (mobile-first behavior).
- Value transparency, accountability, and tracking.

### 4.2 Service Providers
- Independent contractors and small service businesses (1–5 employees).
- Currently using Angi, Thumbtack, or no platform.
- Want steady job flow without high per-lead fees.
- Need invoicing, payment, and scheduling tools built in.

### 4.3 Admin / Operators
- Platform operations team.
- Franchise/territory operators.
- Need full visibility into jobs, providers, disputes, and financials.

---

## 5. Core Feature Modules

### 5.1 Customer Booking Flow

**Requirements:**
- Location-aware search bar (city, ZIP, landmark, free text).
- Service category selection (6 categories at launch, expanding to 12).
- Service area validation (geofenced to active territories).
- Urgency selection: emergency (immediate) or scheduled.
- Photo/video upload for context (max 10 files, 50MB each).
- Service request creation with structured AI-parsed intake.
- Provider match notification with ETA.
- Real-time job status tracking.
- In-app quote approval.
- Secure payment (card, Apple Pay, Google Pay).
- Job confirmation and review submission.

**Out of scope (v1):** Recurring bookings via customer portal (v2), referral program (v2).

---

### 5.2 Provider Portal

**Requirements:**
- Provider application form with ID, certifications, service categories, service area, payout method.
- Admin-controlled verification workflow.
- Availability toggle (online/offline).
- Job offer cards with accept/reject and expiry timer.
- Turn-by-turn navigation deep link to Google Maps.
- Check-in via GPS confirmation + optional OTP.
- Diagnosis and quote submission interface.
- Change order submission workflow.
- Before/after photo upload (required for job completion).
- Job completion trigger.
- Payout tracking and history.
- Provider performance dashboard (trust score, rating, job stats).

---

### 5.3 Admin Command Center

**Requirements:**
- Live job board segmented by status.
- Unassigned job queue with manual dispatch capability.
- SLA breach alerts with escalation options.
- Provider directory with trust scores and availability.
- Dispute queue with evidence viewer and resolution tools.
- Payout queue management.
- Revenue and GMV dashboard.
- AI recommendation feed (from all 10 agents).
- Provider approval workflow.
- Service area management (territory configuration).
- Category and pricing management.
- Audit log viewer.

---

### 5.4 AI OS — 10 Agent System

Each agent runs on Claude claude-sonnet-4 via the Anthropic API and is scoped to a specific operational domain.

**Agent specifications:**

| Agent | Trigger | Input | Output |
|---|---|---|---|
| ALICE | New service request | Customer message, photos, location | service_request draft, category, urgency_score |
| MAX | Unmatched job | Job details, provider pool | provider_ranking, dispatch_recommendation |
| QUINN | Quote submitted | Quote, job type, market data | price_confidence, customer_explanation, overcharge_flag |
| NOVA | Job status change | Job timeline, current status | next_step, reminders, stall_alerts |
| REX | Job completion / complaint | Provider history, reviews | trust_score_update, risk_level |
| IVY | Dispute opened | Full job timeline, all evidence | dispute_summary, resolution_recommendation |
| FINN | Payment event | Job payments, escrow state | payout_recommendation, refund_risk_flag |
| LENA | Job closed | Customer history, service type | rebooking_offer, subscription_recommendation |
| TESS | Daily cron | Territory demand data | territory_health_score, expansion_recommendations |
| GABRIEL | Any agent action | Action log, policy rules | governance_score, compliance_alert |

---

### 5.5 Payment System

**Requirements:**
- Stripe Connect for provider payouts.
- Customer payment: card, Apple Pay, Google Pay.
- Deposit support (configurable per category).
- Escrow hold during active jobs.
- Payout release trigger on customer confirmation (or 48h auto-release).
- Change order payment flow (authorization before work resumes).
- Refund handling with admin approval.
- Dispute-initiated payout freeze.
- Recurring billing for subscription/maintenance plans (v2).
- Platform fee (18–22%) split on payout.

---

### 5.6 Job Status Machine

The platform implements a 30-state status machine with event-driven automation.

**Status groups:**

| Group | Statuses |
|---|---|
| Pre-match | draft, submitted, awaiting_serviceability, awaiting_match |
| Matching | offer_sent, accepted, scheduled |
| Pre-work | deposit_required, deposit_paid, en_route, arrived |
| Active work | diagnosis_in_progress, quote_submitted, awaiting_quote_approval, quote_approved, in_progress |
| Change orders | change_order_submitted, awaiting_change_order_approval, paused |
| Completion | completed_pending_confirmation, customer_confirmed, completed |
| Resolution | disputed, refund_pending, warranty_callback_open, closed |
| Cancellations | cancelled_customer, cancelled_provider, cancelled_system, failed_service |

---

## 6. Service Categories — Launch

| # | Category | Subcategories |
|---|---|---|
| 1 | Plumbing | Leak repair, drain cleaning, pipe repair, faucet install, toilet repair |
| 2 | Electrical | Wiring, outlets, lighting, breaker, panel, EV charger |
| 3 | HVAC / AC | AC repair, heating, tune-ups, filter, diagnostics |
| 4 | Home Cleaning | Deep clean, move-in/out, recurring weekly/bi-weekly |
| 5 | Handyman | Mounting, assembly, drywall, minor repairs |
| 6 | Lawn Care | Mowing, trimming, cleanup, landscaping |

---

## 7. Non-Functional Requirements

### Performance
- Page load (LCP): ≤ 2.5 seconds on 4G mobile.
- Job status updates: real-time via Supabase Realtime (≤ 500ms latency).
- AI agent response time: ≤ 8 seconds per agent invocation (Claude API).
- API response time (P95): ≤ 800ms for all booking endpoints.

### Reliability
- Platform uptime: 99.5%+ (excluding scheduled maintenance).
- Payment processing: 99.9%+ via Stripe.
- AI agent fallback: If any agent fails, human admin review is triggered.

### Security
- All provider documents encrypted at rest (Supabase storage, AES-256).
- Payment card data never stored on platform (Stripe tokenization only).
- Row-level security (RLS) enforced at database level via Supabase.
- OWASP Top 10 mitigation mandatory before production launch.
- Provider check-in: geo-verification required (OTP optional, admin-configurable per category).

### Compliance
- Stripe Connect: KYC/AML handled by Stripe for provider payouts.
- Provider licensing: validated during onboarding, re-verified annually.
- GDPR / CCPA: user data deletion flow required at launch.
- PCI DSS: Stripe handles card data — no PCI scope on the platform itself.

---

## 8. Technical Architecture Overview

See `/docs/architecture.md` for the full diagram and component breakdown.

**Key architecture decisions:**

**Supabase over custom backend:** Accelerates development with built-in auth, realtime, storage, and RLS. Edge functions handle automation triggers. Migrations managed via Supabase CLI.

**Next.js App Router:** Server components for SEO-critical pages (landing, service area pages). Client components for interactive flows (booking, tracking, dashboard).

**AI agents as API route handlers:** Each agent is invoked via `/api/agents/[agent-name]` with structured input/output contracts. Agents do not share state — each call is stateless and logged.

**Stripe Connect (Standard):** Providers connect their own Stripe accounts. VeloCity charges application fees on each transaction. Simplifies compliance and tax responsibility.

**Google Maps Platform:** Geo-validation of service areas, provider routing, customer location capture, service area polygon management.

---

## 9. Launch Phasing

### Phase 1 — MVP (0–90 days)
- Core booking flow (customer-facing).
- Provider onboarding and job acceptance.
- Basic admin job board.
- 3 AI agents active: ALICE, MAX, NOVA.
- Payments: deposit + full payment at completion.
- 2 service categories live: Plumbing, HVAC.

### Phase 2 — Expansion (90–180 days)
- All 6 service categories live.
- All 10 AI agents active.
- Dispute system (IVY + manual admin).
- Provider portal: full performance dashboard.
- Customer review and rebooking flow.
- Recurring service scheduling (LENA).

### Phase 3 — Scale (180–365 days)
- Territory expansion (2nd and 3rd city).
- Franchise/territory operator model.
- Subscription plans for recurring services.
- Advanced admin analytics (TESS + AI KPI reporting).
- Mobile apps (React Native).

---

## 10. Open Questions

| Question | Owner | Target Date |
|---|---|---|
| Should provider payout be T+1 or T+2 business days? | Finance | Pre-launch |
| What is the emergency service surcharge model? | Product | Phase 1 |
| Should change orders require re-authorization or just approval? | Legal | Pre-launch |
| Is OTP check-in required at launch or optional? | Ops | Phase 1 |
| What is the warranty/callback SLA by category? | Product | Phase 2 |

---

## 11. Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Provider supply shortage at launch | High | High | Pre-seed 25+ providers before launch; run referral incentive |
| AI agent hallucination on pricing | Medium | High | QUINN outputs price ranges, not exact quotes; human review threshold |
| Stripe Connect compliance delays | Low | High | Begin provider onboarding early; use Standard connect (faster) |
| Dispute volume exceeds admin capacity | Medium | Medium | IVY agent pre-triages all disputes; escalate only ambiguous cases |
| Google Maps API cost overrun | Low | Medium | Cache service area polygons; rate-limit non-essential geocoding calls |

---

*Document maintained by Zenith AI product team. Questions → hello@zenith-ai.co*
