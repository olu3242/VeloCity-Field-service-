export interface TelemetrySnapshot {
  timestamp: string;
  windowMs: number;
  eventsProcessed: number;
  eventsQueued: number;
  eventsFailed: number;
  aiCallsTotal: number;
  aiCallsSucceeded: number;
  aiCallsFailed: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  anomaliesDetected: number;
  escalationsTriggered: number;
  workflowsCompleted: number;
  workflowsFailed: number;
}

export interface EffectivenessScore {
  automationEffectiveness: number;
  aiEffectiveness: number;
  queueHealth: number;
  operationalReliability: number;
  composite: number;
}

const SNAPSHOTS: TelemetrySnapshot[] = [];

let eventsProcessed = 0;
let eventsFailed = 0;
let aiCallsTotal = 0;
let aiCallsSucceeded = 0;
let totalCostUsd = 0;
let anomaliesDetected = 0;
let escalationsTriggered = 0;
let workflowsCompleted = 0;
let workflowsFailed = 0;
let latencySamples: number[] = [];
let windowStart = Date.now();

export function recordEvent(success: boolean): void {
  eventsProcessed++;
  if (!success) eventsFailed++;
}

export function recordAICall(
  success: boolean,
  latencyMs: number,
  costUsd: number
): void {
  aiCallsTotal++;
  if (success) aiCallsSucceeded++;
  latencySamples.push(latencyMs);
  totalCostUsd += costUsd;
}

export function recordAnomaly(): void {
  anomaliesDetected++;
}

export function recordEscalation(): void {
  escalationsTriggered++;
}

export function recordWorkflow(success: boolean): void {
  if (success) workflowsCompleted++;
  else workflowsFailed++;
}

export function takeSnapshot(): TelemetrySnapshot {
  const avgLatencyMs =
    latencySamples.length > 0
      ? latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length
      : 0;

  const snapshot: TelemetrySnapshot = {
    timestamp: new Date().toISOString(),
    windowMs: Date.now() - windowStart,
    eventsProcessed,
    eventsQueued: 0,
    eventsFailed,
    aiCallsTotal,
    aiCallsSucceeded,
    aiCallsFailed: aiCallsTotal - aiCallsSucceeded,
    avgLatencyMs,
    totalCostUsd,
    anomaliesDetected,
    escalationsTriggered,
    workflowsCompleted,
    workflowsFailed,
  };

  SNAPSHOTS.push(snapshot);
  if (SNAPSHOTS.length > 100) SNAPSHOTS.shift();

  // Reset counters
  eventsProcessed = 0;
  eventsFailed = 0;
  aiCallsTotal = 0;
  aiCallsSucceeded = 0;
  totalCostUsd = 0;
  anomaliesDetected = 0;
  escalationsTriggered = 0;
  workflowsCompleted = 0;
  workflowsFailed = 0;
  latencySamples = [];
  windowStart = Date.now();

  return snapshot;
}

export function calculateEffectiveness(): EffectivenessScore {
  const recent = SNAPSHOTS.slice(-10);

  const totals = recent.reduce(
    (acc, s) => ({
      eventsProcessed: acc.eventsProcessed + s.eventsProcessed,
      eventsFailed: acc.eventsFailed + s.eventsFailed,
      eventsQueued: acc.eventsQueued + s.eventsQueued,
      aiCallsTotal: acc.aiCallsTotal + s.aiCallsTotal,
      aiCallsSucceeded: acc.aiCallsSucceeded + s.aiCallsSucceeded,
      workflowsCompleted: acc.workflowsCompleted + s.workflowsCompleted,
      workflowsFailed: acc.workflowsFailed + s.workflowsFailed,
    }),
    {
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsQueued: 0,
      aiCallsTotal: 0,
      aiCallsSucceeded: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
    }
  );

  const automationEffectiveness =
    totals.eventsProcessed > 0
      ? (1 - totals.eventsFailed / totals.eventsProcessed) * 100
      : 100;

  const aiEffectiveness =
    totals.aiCallsTotal > 0
      ? (totals.aiCallsSucceeded / totals.aiCallsTotal) * 100
      : 100;

  const queueHealth =
    totals.eventsProcessed > 0
      ? 100 - Math.min(100, (totals.eventsQueued / totals.eventsProcessed) * 50)
      : 100;

  const operationalReliability =
    totals.workflowsCompleted + totals.workflowsFailed > 0
      ? (totals.workflowsCompleted /
          (totals.workflowsCompleted + totals.workflowsFailed)) *
        100
      : 100;

  const composite =
    (automationEffectiveness +
      aiEffectiveness +
      queueHealth +
      operationalReliability) /
    4;

  return {
    automationEffectiveness,
    aiEffectiveness,
    queueHealth,
    operationalReliability,
    composite,
  };
}

export function getBusinessIntelligence(): {
  automationROI: string;
  topIssues: string[];
  recommendations: string[];
} {
  const recent = SNAPSHOTS.slice(-10);
  const totalEvents = recent.reduce((s, snap) => s + snap.eventsProcessed, 0);
  const totalFailed = recent.reduce((s, snap) => s + snap.eventsFailed, 0);
  const totalAICalls = recent.reduce((s, snap) => s + snap.aiCallsTotal, 0);
  const totalAIFailed = recent.reduce((s, snap) => s + snap.aiCallsFailed, 0);

  const hoursSaved = (totalEvents * 0.25).toFixed(1);
  const automationROI = `Estimated ${hoursSaved} hours saved across ${totalEvents} automated events`;

  const topIssues: string[] = [];
  if (totalFailed > 5) topIssues.push("Queue failures require attention");
  if (totalAICalls > 0 && totalAIFailed > totalAICalls * 0.1) {
    topIssues.push("AI reliability below threshold");
  }

  const recommendations: string[] = [];
  if (totalFailed > 5) recommendations.push("Investigate event queue error patterns and retry logic");
  if (totalAIFailed > totalAICalls * 0.1) recommendations.push("Review AI agent error handling and fallback strategies");
  if (recommendations.length === 0) recommendations.push("System operating within normal parameters");

  return { automationROI, topIssues, recommendations };
}
