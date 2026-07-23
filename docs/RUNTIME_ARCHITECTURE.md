# Runtime Architecture

## System Overview

VeloCity Field Service OS is a Next.js 14 App Router application with:

- **Multi-tenant** Supabase Postgres backend (RLS + service-role layer)
- **Distributed runtime** via Redis adapter (Upstash REST API)
- **AI agent orchestration** (10 deterministic agents + Anthropic Claude API)
- **Event-driven automation** (71 event types, queue-backed processing)
- **Enterprise certification engine** (weighted scoring, live dashboard)

## Layer Map

```
Browser / Mobile
    │
    ▼
Next.js App Router (Edge middleware → Node.js API Routes)
    │
    ├── Middleware:  Rate limiting (Redis/memory) · Auth · Tracing
    ├── API Routes:  REST endpoints (/api/**) + Webhook handlers
    ├── Server Components: Admin/dashboard pages (SSR)
    └── Client Components: Interactive UI (React 18)
    │
    ▼
Service Layer (src/lib/)
    │
    ├── Redis (src/lib/redis/)          — Rate limit · Circuit breaker · Lock · Idempotency
    ├── Supabase (src/lib/supabase/)    — Auth client · Admin client (service-role)
    ├── Stripe (src/lib/stripe/)        — Payment intents · Webhooks · Idempotency
    ├── AI Agents (src/lib/agents/)     — 10 named agents, AGENT_REGISTRY
    ├── Automation (src/lib/automation/) — Queue worker · Event emitter · FSM
    ├── Governance (src/lib/governance/) — Circuit breaker · Operator state · Safety
    ├── Tracing (src/lib/tracing/)      — W3C traceparent · Span recording
    └── Certification (src/lib/certification/) — Enterprise scoring engine
    │
    ▼
Data Stores
    ├── Supabase Postgres  — All business data (75+ tables, 29 migrations)
    └── Redis (Upstash)    — Rate state · Circuit state · Locks · Idempotency
```

## Request Lifecycle

```
1. Request arrives at Next.js
2. Middleware fires:
   a. Extract traceparent → mint child span
   b. Generate X-Request-Id
   c. Check rate limit (Redis sorted set or in-memory fallback)
   d. Supabase auth session refresh
   e. Role-gate protected routes
   f. Inject traceparent + X-Request-Id + X-Response-Time into response
3. API route handler:
   a. Validate request body (src/lib/validation.ts)
   b. Verify tenant isolation (src/lib/tenant-guard.ts)
   c. Execute business logic
   d. Emit automation events if state changes
4. Response returned with structured JSON
```

## Event Flow

```
emitEvent() → automation_events (Postgres)
                     │
                     ▼
              Cron: /api/cron/automation (every 5 min)
                     │
                     ▼
              worker.processAutomationQueue()
              ├── SELECT FOR UPDATE SKIP LOCKED
              ├── Idempotency check (event_id)
              ├── Handler routing (71 event types)
              ├── AI agent dispatch (if AI event)
              └── Mark complete / retry / dead-letter
```

## AI Agent Architecture

10 named agents registered in `AGENT_REGISTRY`:

| Agent | Role |
|-------|------|
| executive-advisor | Strategic recommendations |
| customer-success | Customer health monitoring |
| finance-agent | Revenue and billing analysis |
| operations-agent | Operational efficiency |
| compliance-agent | Policy and audit monitoring |
| growth-agent | Market expansion analysis |
| technology-agent | Platform health monitoring |
| risk-agent | Risk detection and mitigation |
| quality-agent | Service quality monitoring |
| marketplace-agent | Supply/demand optimization |

All agents are **deterministic** — they query Supabase and return structured
insights without calling the Claude API unless explicitly triggered via the
AI orchestration layer.

## Circuit Breaker Topology

Circuit breakers are registered per service key. Default configuration:
- Threshold: 5 consecutive failures → OPEN
- Reset window: 60 seconds
- Transition: OPEN → HALF-OPEN → CLOSED on success

When Redis is provisioned, circuit state persists across instances (hash key
per circuit, 1-hour TTL). Without Redis, each instance maintains independent
state.

## Certification Engine

```
generateEnterpriseCertification()
├── validateArchitecture()     × 0.25 weight
│   └── 13 checks (agent registry, governance, circuits, tracing, Stripe, probes...)
├── validateTopology()         × 0.20 weight
│   └── 9 checks (agents, compliance, health, distributed runtime...)
├── scoreOperationalReadiness() × 0.30 weight
│   └── 6 dimensions (governance, observability, resilience, health, compliance, distributed)
├── runComplianceValidation()  × 0.15 weight
│   └── 13 compliance rules
└── getResilienceReport()      × 0.10 weight
    └── 6 resilience tests (failover, replay, retry, isolation, circuit, governance)
```

**Current score: 92+ (Premium certified)**

## Environment Variables

### Required
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser Stripe key |
| `ANTHROPIC_API_KEY` | AI agent key |
| `CRON_SECRET` | Cron endpoint protection |

### Optional (with graceful degradation)
| Variable | Feature |
|----------|---------|
| `UPSTASH_REDIS_REST_URL` | Distributed runtime (rate limit, circuit, lock, idempotency) |
| `UPSTASH_REDIS_REST_TOKEN` | Distributed runtime auth |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER` | SMS notifications |
| `SENDGRID_API_KEY` | Email notifications |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps and geocoding |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET` | Google sign-in |
