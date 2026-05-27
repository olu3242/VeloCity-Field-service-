# VeloCity Digital Twin

## Overview

The digital twin (`src/lib/simulation/digital-twin.ts`) maintains a real-time in-memory model of platform operational state — enabling simulation, what-if analysis, and resilience testing without touching production data.

---

## Twin State

```typescript
captureState({
  queueDepth: 45,
  activeWorkers: 3,
  failureRate: 0.03,
  avgProcessingMs: 1800,
  aiCallsPerMinute: 12,
  pendingEscalations: 2,
});
// Derived:
// slaBreachRisk: 0.30   // queueDepth / (activeWorkers × 50)
// systemLoad: 0.30      // queueDepth / 150 (max capacity)
```

State history is capped at 1,000 entries. `getLatestState()` returns the most recent capture.

---

## Twin Configuration

```typescript
getTwinConfig();
// {
//   maxQueueCapacity: 150,
//   targetProcessingMs: 2000,
//   slaBreachThreshold: 0.8,
//   workerScaleThreshold: 0.7,
//   aiCallLimit: 100,
// }

updateTwinConfig({ maxQueueCapacity: 200 });
```

Configuration changes affect all subsequent simulations — they do not alter production settings.

---

## State History Analysis

```typescript
getStateHistory(10);  // last 10 captured states
```

History enables trend detection:
- Rising `failureRate` over last 5 captures → learning engine pattern
- `slaBreachRisk` trending above 0.6 → scaling recommendation
- `systemLoad` consistently > 0.8 → capacity alert

---

## Production vs. Twin

The digital twin is **read-from-production, simulate-only**:

| Operation | Twin | Production |
|---|---|---|
| `captureState()` | Writes twin history | No production change |
| `runSimulation()` | Pure math | No DB writes |
| `updateTwinConfig()` | Twin config only | No runtime change |
| `applyTuning()` (adaptive) | Separate system | Modifies live config |

Simulation results never emit events, never write to DB, never modify governance state.
