# VeloCity-Field-service-# ⚡ VeloCity Field Service

> **Your trusted local service, delivered at velocity.**
> AI-powered field service delivery platform — connecting customers with verified local professionals for repairs, cleaning, maintenance, and emergency home services.

---

## What is VeloCity?

VeloCity is a production-grade **local field service operating system** powered by an ensemble of specialized AI agents. Think Uber meets Jobber meets Thumbtack — built specifically for local service delivery with AI orchestration at every layer.

Customers book trusted local professionals. Providers run their business on the platform. Admins operate in real time. The VeloCity AI OS handles intake, matching, dispatch, pricing, quality, disputes, payments, and retention.

---

## Core Capabilities

| Layer | Description |
|---|---|
| 🎙 Customer Booking | Search, select, upload notes/photos, approve quotes |
| 📡 AI Dispatch | Real-time provider matching by skill, location, trust |
| 💬 Quote Engine | AI-assisted pricing, change orders, approvals |
| 📋 Job Workflow | 30-state job status machine with automation hooks |
| 🔒 Payments | Deposits, escrow, payouts, refunds, recurring billing |
| ⚖️ Dispute Engine | Evidence review, mediation, resolution recommendations |
| 🤖 AI OS | 10 specialized agents running across all workflows |
| 📊 Admin Dashboard | Live ops command center with KPIs and AI recommendations |

---

## AI Agent Roster

| Agent | Role | Purpose |
|---|---|---|
| **ALICE** | Intake | Customer service intake, classification, urgency detection |
| **MAX** | Dispatch | Provider matching, geo-ranking, SLA-aware assignment |
| **QUINN** | Quotes | Pricing guidance, overcharge detection, change orders |
| **NOVA** | Workflow | Job orchestration, status transitions, reminders |
| **REX** | Quality | Trust scoring, reliability monitoring, risk alerts |
| **IVY** | Disputes | Evidence review, mediation, resolution recommendations |
| **FINN** | Finance | Payment monitoring, escrow, payout reconciliation |
| **LENA** | Retention | Rebooking, subscriptions, maintenance reminders |
| **TESS** | Territory | Market intelligence, supply/demand, expansion signals |
| **GABRIEL** | Governance | Compliance, audit trails, policy enforcement |

---

## Tech Stack

```
Frontend        Next.js 14 (App Router)
Styling         Tailwind CSS + shadcn/ui
Auth            Supabase Auth (Google / Facebook OAuth)
Database        Supabase (PostgreSQL)
Storage         Supabase Storage (media / documents)
Realtime        Supabase Realtime (job status updates)
Payments        Stripe (payments, escrow, payouts, subscriptions)
AI              Anthropic Claude (claude-sonnet-4) — all 10 agents
Maps            Google Maps Platform (geo, routing, service area)
Notifications   Twilio SMS + SendGrid Email
State           Zustand
Deploy          Vercel (frontend) + Supabase Cloud (backend)
```

---

## Project Structure

```
velocity-field-service/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (customer)/         # Customer-facing routes
│   │   ├── (provider)/         # Provider portal routes
│   │   ├── (admin)/            # Admin command center
│   │   └── api/                # API route handlers
│   ├── components/
│   │   ├── ui/                 # shadcn/ui base components
│   │   ├── booking/            # Booking flow components
│   │   ├── jobs/               # Job tracking components
│   │   ├── agents/             # AI agent UI components
│   │   └── admin/              # Admin dashboard components
│   ├── lib/
│   │   ├── supabase/           # Supabase client & types
│   │   ├── stripe/             # Stripe helpers
│   │   ├── agents/             # AI agent definitions & runners
│   │   ├── workflows/          # Job workflow state machine
│   │   └── utils/              # Shared utilities
│   ├── store/                  # Zustand state stores
│   └── types/                  # Global TypeScript types
├── supabase/
│   ├── migrations/             # Database schema migrations
│   ├── functions/              # Edge functions (automation)
│   └── seed.sql                # Seed data
├── docs/                       # PRD, architecture, AI strategy
├── .claude/                    # Claude Code configuration
│   ├── CLAUDE.md               # Claude Code instructions
│   ├── commands/               # Custom slash commands
│   └── settings.json           # Project settings
├── public/                     # Static assets
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account
- Stripe account
- Anthropic API key
- Google Maps API key

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/zenith-ai/velocity-field-service.git
cd velocity-field-service

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in your API keys (see .env.example for all required vars)

# 4. Set up Supabase
npx supabase login
npx supabase init
npx supabase db push

# 5. Seed the database
npm run db:seed

# 6. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Anthropic
ANTHROPIC_API_KEY=

# Google
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# SendGrid
SENDGRID_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=
```

---

## Key User Flows

### Customer Flow
```
Search → Select Service → Enter Address → Validate Area →
Choose Urgency → Upload Photos → Create Request →
AI Matches Provider → Provider Accepts → Track ETA →
Approve Quote → Authorize Payment → Work Begins →
Change Orders (if needed) → Job Completed → Leave Review
```

### Provider Flow
```
Apply → Upload Docs → Admin Verification → Go Online →
Receive Job Offer → Accept/Reject → Navigate to Customer →
Check In (Geo+OTP) → Submit Diagnosis+Quote →
Start Job → Upload Before/After → Complete Job → Receive Payout
```

### Admin Flow
```
Approve Providers → Monitor Live Jobs → Manage SLA Breaches →
Handle Disputes → Process Refunds → Manage Payouts →
Review AI Recommendations → Track KPIs
```

---

## Job Status Machine

The platform implements a 30-state job status machine:

```
draft → submitted → awaiting_serviceability → awaiting_match →
offer_sent → accepted → scheduled → deposit_required →
deposit_paid → en_route → arrived → diagnosis_in_progress →
quote_submitted → awaiting_quote_approval → quote_approved →
in_progress → [change_order_submitted → awaiting_change_order_approval] →
completed_pending_confirmation → customer_confirmed → completed →
[disputed → refund_pending] | [warranty_callback_open] → closed
```

---

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
npm run test         # Run test suite
npm run db:seed      # Seed database with test data
npm run db:reset     # Reset and re-seed database
npm run agents:test  # Test all AI agents in isolation
```

---

## Contributing

This project follows the Zenith AI development standards. See `.claude/CLAUDE.md` for Claude Code project configuration and slash commands.

---

## License

Private — © 2026 VeloCity Field Service / Zenith AI. All rights reserved.
