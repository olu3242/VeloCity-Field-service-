# VeloCity Risk Operations

## Overview

The risk operations layer (`src/lib/risk/`) scores payout risk, detects fraud signals, identifies dispute abuse patterns, and maintains a real-time risk heatmap across all tenant dimensions.

---

## Payout Risk Scoring (`payout-risk-scorer.ts`)

```typescript
scorePayoutRisk({
  tenantId: "tenant-abc",
  providerId: "provider-123",
  amountUsd: 75_000,
  priorDisputeCount: 3,
  verificationStatus: "unverified",
  daysSinceLastPayout: 100,
});
// {
//   riskScore: 115 (capped at contextual sum),
//   riskLevel: "critical",
//   factors: ["Amount exceeds $50,000", "More than 2 prior disputes", "Provider unverified", "No payout in over 90 days"],
//   recommendedAction: "block",
// }

batchScorePayouts([...inputs]);
// array of PayoutRiskScore
```

**Risk tiers:** `critical` (≥80) → block | `high` (≥60) → hold | `medium` (≥30) → review | `low` → approve

**Score factors:** amount>$50k (+40), amount>$10k (+20), disputes>2 (+30), unverified (+25), dormant 90d (+20), too-frequent (+15)

---

## Fraud Scoring (`fraud-scorer.ts`)

```typescript
scoreFraud("provider-123", "provider", [
  { type: "velocity", weight: 0.4, description: "5 payouts in 1 hour" },
  { type: "behavioral", weight: 0.3, description: "Unusual dispute pattern" },
]);
// { score: 70, verdict: "suspicious", signals: [...] }

getFraudScore("provider-123");
getHighRiskEntities(40);  // entities with score >= 40
clearScore("provider-123");
```

**Verdict:** `fraud` (≥80) | `suspicious` (≥40) | `clean` (<40)

---

## Dispute Abuse Detection (`dispute-abuse-detector.ts`)

```typescript
detectDisputeAbuse("provider-123", {
  disputeCount: 8,
  windowDays: 30,
  chargebackRate: 0.35,
  resolvedInFavorOfProvider: 7,
});
// { abuseType: "dispute_farming", riskScore: 85, flagged: true }
```

**Abuse types:** `dispute_farming` | `chargeback_fraud` | `serial_disputer`

---

## Risk Heatmap (`risk-heatmap.ts`)

```typescript
updateHeatmap("tenant-abc", "payout_fraud", 72);
updateHeatmap("tenant-abc", "dispute_abuse", 45);

getHeatmap("tenant-abc");
// { payout_fraud: 72, dispute_abuse: 45 }

getHighRiskTenants(60);
// tenants where any dimension >= 60

getPlatformRiskSummary();
// { avgScore, topRiskDimension, tenantsAboveThreshold }
```

Scores are rolling averages — new observations blend with existing score.
