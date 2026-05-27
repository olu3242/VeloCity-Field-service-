// Runtime learning infrastructure — tracks operational patterns and produces tuning signals.

export type TuningSignal = {
  target:
    | "retry_delay"
    | "escalation_threshold"
    | "queue_priority"
    | "notification_timing"
    | "orchestration_sequence";
  currentValue: number | string;
  suggestedValue: number | string;
  confidence: number;
  evidence: string;
  domain: string;
  appliedAt?: string;
};

export interface RuntimePattern {
  id: string;
  patternType:
    | "retry_success"
    | "escalation_timing"
    | "notification_response"
    | "workflow_bottleneck"
    | "ai_accuracy";
  observedAt: string;
  sampleSize: number;
  value: number;
  context: Record<string, unknown>;
}

type TuningSignalWithId = TuningSignal & { id: string };

const PATTERNS: RuntimePattern[] = [];
const SIGNALS: TuningSignalWithId[] = [];

let patternCounter = 0;
let signalCounter = 0;

export function recordPattern(
  pattern: Omit<RuntimePattern, "id" | "observedAt">
): RuntimePattern {
  const id = `pat_${++patternCounter}_${Date.now()}`;
  const full: RuntimePattern = {
    ...pattern,
    id,
    observedAt: new Date().toISOString(),
  };
  PATTERNS.push(full);
  return full;
}

export function generateTuningSignals(): TuningSignal[] {
  const newSignals: TuningSignalWithId[] = [];

  for (const p of PATTERNS) {
    if (p.patternType === "retry_success" && p.value < 0.5) {
      newSignals.push({
        id: `sig_${++signalCounter}`,
        target: "retry_delay",
        currentValue: p.value,
        suggestedValue: "increase",
        confidence: 0.6,
        evidence: `Retry success rate ${(p.value * 100).toFixed(1)}% below 50% threshold (n=${p.sampleSize})`,
        domain: typeof p.context["domain"] === "string" ? p.context["domain"] : "unknown",
      });
    }

    if (p.patternType === "escalation_timing" && p.value > 3_600_000) {
      newSignals.push({
        id: `sig_${++signalCounter}`,
        target: "escalation_threshold",
        currentValue: p.value,
        suggestedValue: Math.round(p.value * 0.75),
        confidence: 0.7,
        evidence: `Escalation timing ${(p.value / 60000).toFixed(0)}min exceeds 60min target (n=${p.sampleSize})`,
        domain: typeof p.context["domain"] === "string" ? p.context["domain"] : "unknown",
      });
    }

    if (p.patternType === "workflow_bottleneck") {
      newSignals.push({
        id: `sig_${++signalCounter}`,
        target: "orchestration_sequence",
        currentValue: p.value,
        suggestedValue: "reorder",
        confidence: 0.5,
        evidence: `Workflow bottleneck detected at step value ${p.value} (n=${p.sampleSize})`,
        domain: typeof p.context["domain"] === "string" ? p.context["domain"] : "unknown",
      });
    }
  }

  SIGNALS.push(...newSignals);
  return newSignals;
}

export function applySignal(signalId: string): boolean {
  const signal = SIGNALS.find((s) => s.id === signalId);
  if (!signal) return false;
  signal.appliedAt = new Date().toISOString();
  return true;
}

export function getActiveTuningSignals(): TuningSignal[] {
  return SIGNALS.filter((s) => !s.appliedAt);
}

export function getRollbackCapability(): {
  canRollback: boolean;
  appliedSignals: TuningSignal[];
} {
  const appliedSignals = SIGNALS.filter((s) => s.appliedAt !== undefined);
  return {
    canRollback: appliedSignals.length > 0,
    appliedSignals,
  };
}
