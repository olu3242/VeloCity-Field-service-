# Trust Layer Strategy

## What's already real and working

- **Testimonials** (`LandingPage.tsx`, `#trust` section): pulled live from the `reviews` table, joined to `profiles` (reviewer name) and `jobs` (category), filtered to `is_public = true`, non-empty comment, `rating >= 4`, most recent 3. The section is conditionally rendered and simply doesn't appear if there are zero qualifying reviews — there is no fallback to fake quotes. This is the strongest piece of the trust layer already in place.
- **Trust bar**: 4 static trust claims (Secure Escrow, Licensed & Insured, Same-Day Available, Satisfaction Guarantee) — these are operational facts about how the platform works (escrow holds, provider verification gating in `provider/apply` approval flow), not unverifiable marketing claims — plus a 5th live item showing real average rating with an honest "New" fallback when no reviews exist yet (fixed earlier in this initiative; previously the page claimed "4.9 Avg Rating — Across 10,000+ reviews" unconditionally in the old static HTML, which was a real unsupported-claim violation now resolved by this DB-driven version).
- **Verified-providers messaging** ("Every technician is background-checked, license-verified...") in the Why Choose Us section is consistent with the real `provider/apply` approval workflow (providers have a `status` field gated to `"approved"` before they can receive offers — confirmed via the dispatch route's `getAvailableProviders` filtering).

## Where trust signals are currently absent but would help

1. **Booking flow (`/book`)**: no trust signal appears near the final "submit booking" action — the moment of highest commitment anxiety for a new customer. A small reassurance line (e.g. "Pay only after work is approved" tied to the real escrow/payment-commitment logic in `hasPaymentCommitment`) would reinforce trust at the exact decision point, without needing new backend work since the underlying guarantee is already real.
2. **Provider apply flow (`/provider/apply`)**: no trust signal speaks to *providers* about why they should trust the platform (payout reliability, dispute support) — the current trust bar is entirely customer-facing. Providers are a second audience for this app and currently see zero trust messaging of their own.
3. **Footer**: as noted in `component-mapping.md`, the "Help Center"/"Contact Us"/"Terms of Service"/"Privacy Policy" links don't resolve to real pages — a visitor checking for legal/support proof-points before trusting the platform with payment info currently hits a dead end. This is itself a trust gap, not just a navigation bug.

## Recommendation

- Do not add more testimonial-style content — the existing real-review pipeline is correct and should not be diluted with synthetic quotes.
- The highest-leverage next trust addition is a one-line escrow/payment-guarantee reassurance directly on the `/book` page near the submit action, since the underlying guarantee (`hasPaymentCommitment`) is already real and just needs to be surfaced in copy. Not implemented in this pass — adding new booking-page copy touches a live conversion flow and is better validated with the user before changing, per the implementation-safety principle of not touching booking/payment surfaces without explicit sign-off.
- Provider-facing trust messaging and real Terms/Privacy/Help pages are both real gaps but require new content (legal copy, provider-specific proof points) that shouldn't be fabricated — flagged for a follow-up content pass.
