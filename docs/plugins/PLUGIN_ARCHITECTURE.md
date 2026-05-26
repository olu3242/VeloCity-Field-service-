# VeloCity Plugin Architecture

## Overview

The plugin system allows operational capabilities to be extended without modifying core runtime code. Plugins register hook handlers that execute at defined points in the execution lifecycle.

```
Automation event processed
        ↓
executeHook("after:event_emitted", { payload, tenantId })
        ↓
getPluginsForHook() → sorted by priority
        ↓
Plugin 1: gabriel-audit → auditLog()      (priority 1)
Plugin 2: supabase-notifications → route() (priority 10)
        ↓
HookResult { pluginsRun, errors, durationMs }
```

---

## Plugin Registry (`src/lib/plugins/registry.ts`)

### Registering a Plugin

```typescript
registerPlugin({
  id: "my-custom-integration",
  name: "My Integration",
  version: "1.0.0",
  description: "Custom tenant analytics",
  type: "analytics",
  hooks: [
    { event: "after:event_emitted", handler: "trackEvent", priority: 20, async: true },
  ],
  status: "active",
  tenantId: "tenant-abc123",  // tenant-specific plugin
  metadata: { endpoint: "https://analytics.example.com" },
});
```

### Plugin Types

| Type | Use Case |
|---|---|
| `integration` | External system connectors (Stripe, Twilio, etc.) |
| `automation` | Automation behavior extensions |
| `ai_tool` | Additional AI capabilities |
| `analytics` | Event tracking and reporting |
| `notification` | Notification channel extensions |
| `workflow` | Custom workflow steps |

### Tenant Isolation

- `tenantId: undefined` → global plugin (applies to all tenants)
- `tenantId: "abc123"` → only fires for that tenant's events

`getActivePlugins(tenantId)` returns global + tenant-specific active plugins.

---

## Hook Points

| Hook Point | When It Fires |
|---|---|
| `before:agent_execution` | Before dispatchAgent() calls runAgent() |
| `after:agent_execution` | After agent result returned |
| `before:event_emitted` | Before event written to automation_events |
| `after:event_emitted` | After event enqueued |
| `on:circuit_open` | When a circuit breaker opens |
| `on:circuit_close` | When circuit resets |
| `on:runtime_pause` | When operator pauses runtime |
| `on:runtime_resume` | When operator resumes |
| `on:handler_error` | When a handler throws |
| `on:queue_flood` | When flood protection triggers |
| `after:workflow_complete` | When a workflow finishes |
| `before:payout_release` | Before payout_released event |
| `before:dispute_resolve` | Before dispute_resolved event |

---

## Built-In Plugins

### stripe-adapter (global)
- Hook: `before:payout_release`
- Validates Stripe payment state before allowing payout release

### supabase-notifications (global)
- Hook: `after:event_emitted`
- Routes critical events to in-app notifications table

### gabriel-audit (global)
- Hook: `after:event_emitted`
- Records audit trail for every processed event (priority 1 — runs first)

---

## Programmatic Hook Registration

For runtime hook registration without defining a full plugin:

```typescript
import { registerHookHandler } from "@/lib/plugins/hooks";

registerHookHandler("on:handler_error", async (ctx) => {
  console.error("[Custom Monitor]", ctx.payload.event_type, ctx.payload.error);
});
```

---

## Plugin Governance

- Plugins run inside try/catch — a failing plugin never blocks core execution
- Plugin execution time is included in `HookResult.durationMs`
- Errors per plugin are collected in `HookResult.errors` for observability
- Admin can disable a plugin: `unregisterPlugin(id)` or set `status: "disabled"`
- All plugin activity is observable via HookResult logging
