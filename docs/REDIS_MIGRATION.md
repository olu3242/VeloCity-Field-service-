# Redis Migration Guide

## Overview

VeloCity Field Service OS uses a **Redis adapter layer** (`src/lib/redis/`) that
decouples distributed runtime concerns from their backing store. When Redis is
not provisioned, every component falls back to a per-instance in-memory
implementation automatically — no code changes required.

## Architecture

```
src/lib/redis/
├── client.ts         Upstash REST HTTP client (fetch-based, no npm package)
├── rate-limiter.ts   Sliding-window rate limiter (sorted sets + Lua)
├── circuit-breaker.ts  Distributed circuit breaker (Redis hashes)
├── lock.ts           Distributed locking (SET NX EX + Lua release)
├── idempotency.ts    Idempotency key store (SET NX + TTL)
└── index.ts          Exports + health check
```

### Client design

The `RedisClient` class communicates via the Upstash REST API using the
built-in `fetch`. No npm package is required. Responses are JSON.

```
POST https://{UPSTASH_REDIS_REST_URL}
Authorization: Bearer {UPSTASH_REDIS_REST_TOKEN}
Content-Type: application/json
Body: ["COMMAND", "arg1", ...]
```

Pipeline:

```
POST https://{UPSTASH_REDIS_REST_URL}/pipeline
Body: [["SET","k","v","EX","60"], ["INCR","counter"]]
```

## Provisioning (Upstash)

1. Create a database at [console.upstash.com](https://console.upstash.com)
2. Copy the **REST URL** and **REST Token**
3. Add to your environment:

```env
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

## Key Namespacing

All keys are namespaced to prevent collisions across features:

| Prefix | Feature |
|--------|---------|
| `rl:{tenant/ip}:{path}` | Rate limiting (sliding window) |
| `cb:{key}` | Circuit breaker state |
| `lock:{resource}` | Distributed locks |
| `idem:{namespace}:{key}` | Idempotency store |

## Fallback Behaviour

| Component | Redis absent | Redis present |
|-----------|-------------|---------------|
| Rate limiter | Per-instance sliding window | Cross-instance sorted-set window |
| Circuit breaker | Per-instance Map | Cross-instance hash (with TTL) |
| Distributed lock | Returns `null` (caller handles) | SET NX EX + Lua release |
| Idempotency | Per-instance Map (no persistence) | SET NX + 24h TTL |

## Health Check

```
GET /api/health
```

Returns `subsystems.redis` as one of:
- `"ok (Nms)"` — connected and responsive
- `"not-configured"` — env vars absent; running in-memory
- `"unreachable"` — configured but ping failed

## Rate Limiter Algorithm

**Sliding window with sorted sets** (O(log N) per request):

```lua
ZREMRANGEBYSCORE key 0 (now - windowMs)   -- evict expired
count = ZCARD key                          -- count active
if count >= limit: return {0, 0}          -- blocked
ZADD key now uid                           -- record request
EXPIRE key ttl
return {1, limit - count - 1}             -- allowed
```

Tenanted keys: `rl:tenant:{tenantId}:{path}` when `x-tenant-id` header is
present; falls back to `rl:{ip}:{path}`.

## Distributed Locking

Uses **SET NX EX** for acquisition and a Lua script for safe release:

```lua
-- Only delete if we own the lock (prevents lock theft)
if GET key == ownerId then DEL key end
```

`withLock(resource, ttlMs, ownerId, fn)` is the safe wrapper — always
releases on success or error.

## Migration Checklist

- [ ] Provision Upstash Redis database
- [ ] Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to environment
- [ ] Verify `/api/health` shows `redis: "ok (Nms)"`
- [ ] Run `GET /api/ready` returns `{"ready":true}`
- [ ] Verify rate limiting shows `X-RateLimit-Source: redis` in 429 responses
- [ ] Test replay protection: submit same Stripe event ID twice → second returns `deduplicated: true`
