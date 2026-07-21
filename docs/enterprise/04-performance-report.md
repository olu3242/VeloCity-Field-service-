# Performance & Scalability Report

**Platform:** VeloCity Field Service  
**Report date:** 2026-07-21

---

## 1. Build Output

The platform targets a Next.js production build (`npm run build`). The build is enforced in CI (`.github/workflows/ci.yml`) on every push to `main` and feature branches. A build failure blocks merge.

Build steps validated in CI:
1. TypeScript type check (`npm run type-check`)
2. ESLint lint (`npm run lint`)
3. Production build (`npm run build`)
4. Test suite (fails if zero tests run)

Post-MVP experimental modules (neural runtime, federation network, swarm coordination) compile into the application but are inactive. They introduce minor bundle size overhead with no security risk. Full tree-shaking removal is deferred.

---

## 2. Rate Limiting Thresholds

Rate limiting is applied in `src/middleware.ts` using an in-memory sliding window. Thresholds were chosen based on expected call volumes per route category:

| Route category | Path pattern | Limit | Window | Rationale |
|---|---|---|---|---|
| Automation emit + payments | `/api/automation/emit`, `/api/payments/*` | 10 req/min per IP | 60s | High-value operations; low frequency expected in normal use |
| Stripe webhooks | `/api/webhooks/*` | 30 req/min per IP | 60s | Stripe delivers bursts during event storms; 30/min covers normal burst |
| General API | All other `/api/*` | 60 req/min per IP | 60s | Sufficient for dashboard polling and CRUD operations |

Rate-limited responses return HTTP 429 with `Retry-After: 60`. The limit is per IP address extracted from `x-forwarded-for` (first entry).

---

## 3. Database Indexing

Indexes defined across the migrations. Key indexes for query performance:

**`jobs` table (migration 001):**
- `jobs_customer_id_idx` on `customer_id`
- `jobs_provider_id_idx` on `provider_id`
- `jobs_status_idx` on `status`
- `jobs_category_idx` on `category`
- `jobs_created_at_idx` on `created_at DESC`
- `jobs_tenant_id_idx` on `tenant_id` (migration 003)

**`providers` table (migration 001):**
- `providers_status_idx` on `status`
- `providers_categories_idx` — GIN index on `categories` array for category-based provider search
- `providers_trust_score_idx` on `trust_score DESC`
- `providers_tenant_id_idx` on `tenant_id` (migration 003)

**`automation_queue` table (migration 002):**
- Composite index on `(status, next_retry_at)` — primary query path for queue polling
- Index on `event_type`
- Index on `created_at DESC`
- Partial index on `dedup_key WHERE dedup_key IS NOT NULL`

**`automation_dead_letters` table (migration 20260721000001):**
- `idx_dead_letters_tenant` on `tenant_id`
- `idx_dead_letters_unresolved` — partial index on `(tenant_id, created_at DESC) WHERE resolved_at IS NULL`
- `idx_dead_letters_queue_id` — partial index on `original_queue_id WHERE original_queue_id IS NOT NULL`

**`enterprise_memory` table:**
- `enterprise_memory_tenant_cat` on `(tenant_id, category)`
- `enterprise_memory_entity` on `(tenant_id, entity_type, entity_id)`
- `enterprise_memory_created` on `(tenant_id, created_at DESC)`

**Tenant ID indexes (migration 003):**
All core tables have `tenant_id` indexes: `profiles`, `service_areas`, `providers`, `jobs`, `quotes`, `payments`, `disputes`, `provider_offers`, `notifications`, `agent_logs`.

**Gap:** No indexes on `automation_runs` beyond its primary key. At high volume, queries against `automation_runs` filtered by `status` or `event_type` will require a table scan.

---

## 4. Queue Processing

**Worker function:** `processAutomationQueue(supabase?, limit = 10, tenantId?)` in `src/lib/automation/worker.ts`

**Batch size:** 10 events per worker run (configurable via `limit` parameter).

**Concurrency model:** The worker processes events serially within a single invocation — one event at a time in a `for` loop. Multiple cron invocations running in parallel can each pick up 10 events independently, providing horizontal throughput without locking.

**Retry schedule:** Exponential backoff with full jitter.
- Attempt 1 → 2: delay = `random() * min(900_000, 60_000 * 2^0)` = 0–60s
- Attempt 2 → 3: delay = `random() * min(900_000, 60_000 * 2^1)` = 0–120s
- Attempt 3 → dead-letter: delay = `random() * min(900_000, 60_000 * 2^2)` = 0–240s (then final failure)

**MAX_RETRIES:** 3. After 3 failures, the event is written to `automation_dead_letters` and the queue row is marked `status = "failed"`.

**BASE_RETRY_DELAY_MS:** 60,000 ms (1 minute).  
**MAX_RETRY_DELAY_MS:** 900,000 ms (15 minutes).

Full jitter ensures retries do not converge on the same time window under burst failures (avoids the "retry storm" pattern).

**Runtime pause:** If `isRuntimePaused()` returns true, the worker returns immediately with `skipped = limit`. Queue rows are left untouched so they resume from their current state after `resume_runtime`.

---

## 5. AI Agent Execution

All 10 specialist agents are invoked in `coordinateAgents()` via `Promise.all(agentTypes.map(type => AGENT_RUNNERS[type](tenantId)))`. This means agents within a single coordination call execute in parallel, not sequentially.

Each agent calls `getAdminClient()` to query Supabase directly. Latency for a full 10-agent coordination call is bounded by the slowest individual agent query, plus the `storeEnterpriseMemory()` write at the end.

Agents that call external intelligence functions (e.g., `computeExecutiveIntelligence`, `computeCommercialRevenueIntelligence`) may themselves issue multiple parallel Supabase queries. There is no query result caching between agent invocations.

**Anthropic API calls:** The current coordinator implementation uses deterministic data-fetching functions. The `ANTHROPIC_API_KEY` is required at startup but the coordinator itself does not call the Claude API directly — intelligence is computed from Supabase data. Other parts of the platform (AI classification, match scoring) call Claude for natural language tasks.

---

## 6. Circuit Breaker Thresholds

Defined in `src/lib/governance/circuit-breaker.ts`:

| Parameter | Value |
|---|---|
| `DEFAULT_THRESHOLD` | 5 consecutive failures |
| `DEFAULT_RESET_TIME_MS` | 60,000 ms |
| Half-open recovery | Single success closes circuit |

These are module-level constants applied to all circuits. There is no per-circuit threshold override in the current implementation.

---

## 7. Scalability Constraints

The following in-memory state creates hard constraints on horizontal scaling:

| Component | State location | Impact |
|---|---|---|
| Rate limiter | `rateLimitStore: Map` in `src/middleware.ts` | Each Vercel instance has its own counter. Limits are per-instance, not global. |
| Circuit breakers | `circuits: Map` in `src/lib/governance/circuit-breaker.ts` | Each instance has its own circuit state. An open circuit on one instance does not affect others. |
| Operator state | `state: OperatorState` in `src/lib/governance/operator.ts` | `pauseRuntime()` affects only the instance that received the call. |

All three components must be migrated to a shared external store (Redis/Upstash) before deploying more than one Vercel function instance.

**Single-instance throughput estimate:** With 10 queue events per worker run, a cron trigger every 60 seconds processes up to 600 events/hour sustained. Burst processing (multiple cron invocations in parallel) is limited by Supabase connection pool limits.

---

## 8. Bundle Considerations

Post-MVP modules in `src/lib/` (neural runtime, federation, swarm, evolution) are compiled into the application bundle but referenced only through feature flag checks. They cannot be invoked without setting `NEXT_PUBLIC_FF_*` variables. Tree-shaking does not eliminate them because they are imported at module level. The bundle size overhead is present but does not affect runtime performance or security.

---

## 9. Cache Strategy

Supabase query results are not cached at the application layer. Each request queries the database directly. This is acceptable for MVP with low concurrency. Before high-traffic launch:
- Consider Supabase connection pooling (PgBouncer)
- Consider result caching for expensive intelligence queries (e.g., `computeExecutiveIntelligence`) using a short TTL in Redis

---

## 10. Recommendations

| Priority | Recommendation |
|---|---|
| High (before scaling) | Migrate rate limiter to Upstash Redis using sliding window script |
| High (before scaling) | Persist circuit breaker state to a `circuit_state` table or Redis |
| High (before scaling) | Persist operator state (pause/resume) to database |
| Medium | Add indexes on `automation_runs(status)` and `automation_runs(event_type)` |
| Medium | Add response caching (Redis TTL) for intelligence compute functions called by AI agents |
| Low | Run `EXPLAIN ANALYZE` on the top 5 most frequent API queries in production |
| Low | Bundle analysis (`@next/bundle-analyzer`) to quantify post-MVP module overhead |
