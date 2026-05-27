# VeloCity Automation Marketplace

## Overview

The automation marketplace (`src/lib/automation-marketplace/`) enables tenants to discover, import, version, and govern reusable workflow automation templates — with full activation lifecycle managed through governance controls.

---

## Workflow Registry (`workflow-registry.ts`)

```typescript
publishTemplate({
  id: "custom-sla-handler-v1",
  name: "Custom SLA Handler",
  description: "Escalates SLA breaches with custom priority routing.",
  version: "1.0.0",
  eventTypes: ["sla_breach"],
  steps: ["HERALD alert", "MAX re-dispatch"],
  published: true,
  tags: ["sla", "escalation"],
});

getTemplate("dispute-auto-resolve-v1");
searchTemplates("dispute");  // keyword search on name, description, tags
getAllPublished();            // all published templates
incrementUsage("dispute-auto-resolve-v1");
```

**Pre-registered templates:**

| ID | Trigger | Steps |
|---|---|---|
| dispute-auto-resolve-v1 | dispute_opened | GABRIEL audit → IVY analysis → auto-resolve or escalate |
| payment-recovery-v1 | payment_failed | FINN retry → notify customer → escalate if needed |

---

## Template Versioning (`template-versioning.ts`)

```typescript
createVersion("dispute-auto-resolve-v1", {
  version: "2.0.0",
  changes: "Added GABRIEL pre-audit step",
  steps: ["GABRIEL pre-audit", "IVY analysis", "auto-resolve"],
});

getVersionHistory("dispute-auto-resolve-v1");
// [{ version: "1.0.0", ... }, { version: "2.0.0", ... }]

deprecateVersion("dispute-auto-resolve-v1", "1.0.0");
// marks version as deprecated
```

---

## Tenant Import/Export (`tenant-import-export.ts`)

```typescript
exportTemplate("tenant-abc", "dispute-auto-resolve-v1");
// { exportId, templateId, tenantId, exportedAt, payload }

importTemplate("tenant-xyz", exportId);
// creates local copy of template for tenant-xyz

getExportsForTenant("tenant-abc");
getImportsForTenant("tenant-xyz");
```

Caps: 100 exports, 100 imports.

---

## Governed Activation (`governed-activation.ts`)

Full activation lifecycle gated by governance:

```typescript
const req = requestActivation("tenant-abc", "dispute-auto-resolve-v1", "admin-user");
// req.status = "pending" (or "rejected" if runtime paused)

approveActivation(req.id, "Approved for production use");
activateTemplate(req.id);  // req.status = "active"

rejectActivation(req.id, "Template not certified for enterprise tier");

getActiveTemplates("tenant-abc");
// all active activations for tenant
```

If `isRuntimePaused()` is true at request time, the activation is immediately rejected with reason "Runtime paused".
