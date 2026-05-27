# VeloCity Capacity Intelligence

## Overview

The capacity intelligence layer (`src/lib/capacity/`) provides queue capacity forecasting, worker saturation detection, orchestration load scoring, and peak traffic prediction — enabling proactive scaling before saturation occurs.

---

## Queue Forecasting (`queue-forecaster.ts`)

```typescript
// Record current state regularly (e.g., every 30s via worker):
recordSample({
  timestamp: Date.now(),
  depth: 45,
  processingRate: 12,
  workerCount: 3,
});

forecastQueue(3_600_000);  // 1-hour forecast
// {
//   predictedDepth: 52,
//   predictedProcessingRate: 12,
//   capacityHeadroomPct: 65,   // 65% capacity remaining
//   confidenceScore: 0.8,      // based on sample count
// }

getDepthTrend();  // "growing" | "stable" | "shrinking"
```

**Confidence:** scales linearly from 0 at 0 samples to 1.0 at 20+ samples. Forecasts with < 5 samples fall back to current live state.

---

## Worker Saturation (`worker-saturation.ts`)

```typescript
recordSaturation();
// {
//   workerCount: 3,
//   queueDepth: 45,
//   eventsPerWorker: 15,
//   saturationLevel: "elevated",
//   utilizationPct: 30,
//   recommendation: "Monitor — approaching threshold",
// }
```

**Saturation levels (utilization = queueDepth / (workers × 50)):**

| Level | Utilization | Recommendation |
|---|---|---|
| healthy | < 40% | No action needed |
| elevated | 40–70% | Monitor closely |
| saturated | 70–90% | Scale workers now |
| critical | > 90% | Emergency scaling required |

---

## Load Scoring (`load-scorer.ts`)

Composite load score from three signals:

```typescript
scoreLoad();
// {
//   queueScore: 70,     // 100 - depth/150×100
//   workerScore: 75,    // activeWorkers/4×100
//   aiScore: 80,        // 100 - openCircuits×20
//   compositeScore: 74, // queue×0.4 + worker×0.4 + ai×0.2
//   loadLevel: "moderate",
// }

recordLoad();   // append to rolling 100-entry history
getLoadHistory(10);
```

**Load levels:** > 80 = low | 60-80 = moderate | 40-60 = high | < 40 = critical

---

## Peak Prediction (`peak-predictor.ts`)

```typescript
predictPeak("next_hour", 2.0);  // expect 2× normal traffic
// {
//   expectedPeakDepth: 90,
//   expectedPeakRate: 24,
//   recommendedWorkers: 6,
//   riskLevel: "medium",
// }

getScalingRecommendation();
// "For next_hour (1.5× expected): scale to 4 workers, risk: low"
```

**Risk levels:** multiplier ≥ 3 = high | ≥ 2 = medium | < 2 = low

---

## Capacity → Scaling Pipeline

```
recordSample() every 30s
    ↓
forecastQueue(3_600_000) → capacityHeadroomPct
    ↓
recordSaturation() → saturationLevel
    ↓
scoreLoad() → loadLevel
    ↓
predictPeak("next_hour", multiplier) → recommendedWorkers
    ↓
analyzeLoad() (scaling layer) → ScalingRecommendation
    ↓
computeOptimalWorkerCount() → scale infrastructure
```
