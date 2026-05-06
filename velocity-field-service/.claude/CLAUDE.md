# CLAUDE.md — VeloCity Field Service

> Claude Code configuration for the VeloCity Field Service project.
> Read this file at the start of every session before taking any action.

---

## Project Identity

**Product:** VeloCity Field Service  
**Type:** AI-powered local field service delivery platform  
**Stack:** Next.js 14 · Supabase · Stripe Connect · Anthropic Claude · Google Maps  
**Owner:** Zenith AI  
**Claude Code Role:** Full-stack implementation agent

---

## Architecture at a Glance

```
src/app/
├── (customer)/          # Booking flow, job tracking, reviews
├── (provider)/          # Provider portal — jobs, earnings, profile
├── (admin)/             # Operations command center
└── api/
    ├── agents/          # AI agent invocation endpoints
    ├── webhooks/        # Stripe + Supabase webhook handlers
    ├── jobs/            # Job CRUD and status transitions
    └── payments/        # Stripe payment intents and payouts

supabase/
├── migrations/          # All schema changes — never edit DB manually
└── functions/           # Edge functions for automation triggers
```

---

## Non-Negotiable Rules

### Code Quality
- All new files MUST have TypeScript types — no `any` without explicit comment justification.
- All Supabase queries MUST use the typed client (`createClient<Database>`).
- All API routes MUST validate request body with Zod before processing.
- All database writes MUST go through the Supabase client (never raw SQL in API routes).
- All Stripe operations MUST be wrapped in try/catch with proper error responses.

### Security Rules — NEVER VIOLATE
- NEVER expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code.
- NEVER expose `STRIPE_SECRET_KEY` in client-side code.
- NEVER expose `ANTHROPIC_API_KEY` in client-side code.
- All `NEXT_PUBLIC_` variables are visible to the browser — treat as public.
- All admin routes MUST check for admin role in session before proceeding.
- All provider routes MUST verify the provider_id matches the authenticated user.

### Agent Rules
- AI agents MUST receive structured JSON input — never raw user strings.
- AI agents MUST return structured JSON — parse and validate before using.
- If an agent invocation fails, log the error and trigger `admin_review_required: true`.
- Always log agent runs to the `ai_agent_runs` table (agent_name, input, output, latency, model).
- Temperature is ALWAYS 0.2 for agent calls.
- Model is ALWAYS `claude-sonnet-4-20250514`.

### Database Rules
- All schema changes go in `supabase/migrations/` — never edit production schema directly.
- RLS (Row Level Security) MUST be enabled on every table — check before creating tables.
- Use UUIDs for all primary keys (`gen_random_uuid()`).
- Timestamps: always `created_at` and `updated_at` with auto-update trigger.

### Job Status Machine
- Status transitions MUST follow the defined state machine (see `src/lib/workflows/job-status-machine.ts`).
- NEVER allow arbitrary status transitions — validate against allowed transitions before writing.
- Every status change MUST create a record in `job_events` table.
- Payment actions (authorize, capture, refund) MUST be logged in `payments` table.

---

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Files | kebab-case | `job-status-machine.ts` |
| Components | PascalCase | `JobStatusBadge.tsx` |
| Hooks | camelCase with `use` prefix | `useJobTracking.ts` |
| API routes | kebab-case segments | `/api/jobs/[id]/status` |
| DB tables | snake_case | `job_assignments` |
| DB columns | snake_case | `created_at`, `provider_id` |
| Zustand stores | camelCase with `Store` suffix | `bookingStore` |
| Agent files | agent name lowercase | `alice.ts`, `max.ts` |
| Environment vars | SCREAMING_SNAKE_CASE | `ANTHROPIC_API_KEY` |

---

## File Creation Checklist

Before creating any new file, confirm:
- [ ] Does this file have a clear, single responsibility?
- [ ] Is it in the correct directory?
- [ ] Does it import from `@/lib` (not relative paths going up more than 2 levels)?
- [ ] Does it have TypeScript types for all props/params/returns?
- [ ] Does it follow the naming convention above?

---

## Agent Invocation Pattern

When implementing an AI agent API route:

```typescript
// src/app/api/agents/alice/route.ts
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { AliceInputSchema, AliceOutput } from '@/lib/agents/schemas/alice';
import { ALICE_SYSTEM_PROMPT } from '@/lib/agents/prompts/alice';

export async function POST(request: Request) {
  const supabase = createServerClient();
  const startTime = Date.now();
  
  // 1. Validate input
  const body = await request.json();
  const input = AliceInputSchema.parse(body);
  
  // 2. Invoke Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  
  let output: AliceOutput;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0.2,
      system: ALICE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    });
    
    output = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');
  } catch (error) {
    // 3. Fallback on error
    output = { admin_review_required: true, error: String(error) } as AliceOutput;
  }
  
  // 4. Log the run
  await supabase.from('ai_agent_runs').insert({
    agent_name: 'alice',
    input,
    output,
    latency_ms: Date.now() - startTime,
    model: 'claude-sonnet-4-20250514',
  });
  
  return Response.json(output);
}
```

---

## Job Status Transition Pattern

```typescript
// Always use the status machine helper — never write status directly
import { transitionJobStatus } from '@/lib/workflows/job-status-machine';

const result = await transitionJobStatus({
  supabase,
  jobId: 'uuid',
  fromStatus: 'quote_submitted',
  toStatus: 'quote_approved',
  actorId: customerId,
  actorType: 'customer',
  metadata: { approved_at: new Date().toISOString() },
});

if (!result.success) {
  // Invalid transition — return 422
}
```

---

## Common Supabase Patterns

### Typed client setup
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

### RLS-safe query
```typescript
// Always select only what you need
const { data, error } = await supabase
  .from('jobs')
  .select('id, status, created_at, service_category')
  .eq('customer_id', userId)
  .order('created_at', { ascending: false });
```

---

## Stripe Payment Pattern

```typescript
// Authorize (do not capture yet)
const paymentIntent = await stripe.paymentIntents.create({
  amount: quoteAmountCents,
  currency: 'usd',
  capture_method: 'manual',  // Important: manual capture after job completion
  application_fee_amount: Math.round(quoteAmountCents * 0.20), // 20% platform fee
  transfer_data: { destination: provider.stripe_account_id },
  metadata: { job_id: jobId, provider_id: providerId },
});

// Capture on job completion
await stripe.paymentIntents.capture(paymentIntentId);
```

---

## Slash Commands Available

Run these in Claude Code with `/command-name`:

| Command | Description |
|---|---|
| `/new-agent [name]` | Scaffold a new AI agent (schema + prompt + route + test) |
| `/new-migration [name]` | Create a new Supabase migration file |
| `/add-status [status]` | Add a new job status to the state machine |
| `/scaffold-api [resource]` | Generate CRUD API route for a new resource |
| `/agent-test [name]` | Run isolated test for a specific agent |
| `/check-rls` | Audit all tables for missing RLS policies |
| `/stripe-test` | Run Stripe webhook test with sample payload |

---

## Key File Locations

| What | Where |
|---|---|
| Job status machine | `src/lib/workflows/job-status-machine.ts` |
| Agent schemas | `src/lib/agents/schemas/` |
| Agent prompts | `src/lib/agents/prompts/` |
| Agent runners | `src/lib/agents/runners/` |
| Supabase types | `src/types/database.ts` |
| Zustand stores | `src/store/` |
| Global types | `src/types/` |
| Seed data | `supabase/seed.sql` |
| Edge functions | `supabase/functions/` |

---

## When in Doubt

1. Check the PRD: `docs/PRD.md`
2. Check the AI strategy: `docs/AI-STRATEGY.md`
3. Check the architecture diagram: `docs/architecture.md`
4. Ask — don't guess on payment logic, status transitions, or agent governance.

**Never ship code that:**
- Skips Zod validation on API inputs
- Bypasses the job status machine
- Exposes secret keys client-side
- Writes to the database without RLS verification
- Invokes an agent without logging the run
