# VeloCity AI Orchestration Marketplace

## Overview

The AI orchestration marketplace (`src/lib/ai-marketplace/`) provides a governed registry of AI capabilities derived from the AGENT_REGISTRY, reusable multi-capability orchestration templates, and policy-aware activation controls for enterprise deployments.

---

## Capability Registry (`capability-registry.ts`)

Pre-populated from AGENT_REGISTRY at module load:

```typescript
getCapability("ivy-resolve");
// {
//   capabilityId: "ivy-resolve",
//   agentName: "IVY",
//   name: "IVY Dispute Resolution",
//   requiredConfidence: 0.80,
//   policyGated: true,
//   status: "available",
//   usageCount: 0,
// }

findCapabilitiesForEvent("dispute_opened");
// all non-deprecated capabilities supporting this event type

registerCapability({ capabilityId: "custom-scorer", ... });
recordUsage("ivy-resolve");

getCapabilityReport();
// { total, byStatus: { available: 8, beta: 2 }, topUsed: [...] }
```

**Pre-registered capabilities:** IVY (dispute resolution), FINN (finance automation), GABRIEL (governance audit), MAX (smart dispatch), HERALD (notifications), ARIA (customer alerts), plus named variants `gabriel-audit`, `ivy-resolve`, `finn-retry`, `aria-notify`.

---

## Orchestration Templates (`orchestration-templates.ts`)

Multi-capability workflow blueprints:

```typescript
getTemplate("dispute-full-flow");
// {
//   capabilities: ["gabriel-audit", "ivy-resolve"],
//   triggerEventType: "dispute_opened",
//   estimatedCostUsd: 0.025,
//   estimatedDurationMs: 60_000,
//   successRateEstimate: 0.95,
//   policyChecked: true,
// }

getTemplatesForEvent("payment_failed");
// [payment-recovery-flow, ...]

validateTemplate(template);
// { valid: true, issues: [] }

publishTemplate(template);
```

**Pre-registered templates:**

| ID | Trigger | Capabilities | Est. Cost |
|---|---|---|---|
| dispute-full-flow | dispute_opened | gabriel-audit, ivy-resolve | $0.025 |
| payment-recovery-flow | payment_failed | finn-retry, aria-notify | $0.015 |

---

## Policy-Aware Activation (`policy-aware-activation.ts`)

Governs template activation with policy checks before execution:

```typescript
checkPolicyBeforeActivation("dispute-full-flow", "tenant-abc");
// { allowed: true, requiredConfidence: 0.80, policyGated: true }

activateWithPolicy("dispute-full-flow", "tenant-abc", context);
// checks isRuntimePaused(), validates policy, records usage
// returns { activated: true } or { activated: false, reason }
```
