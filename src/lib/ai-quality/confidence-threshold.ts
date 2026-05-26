export interface ThresholdConfig {
  agentName: string;
  domain: string;
  minConfidence: number;
  warnConfidence: number;
  autoApproveConfidence: number;
}

export type ConfidenceDecision = "auto_approve" | "approve" | "warn" | "reject";

const THRESHOLDS: Map<string, ThresholdConfig> = new Map();

const DEFAULT_THRESHOLD: ThresholdConfig = {
  agentName: "",
  domain: "",
  minConfidence: 0.6,
  warnConfidence: 0.75,
  autoApproveConfidence: 0.92,
};

function thresholdKey(agentName: string, domain: string): string {
  return `${agentName}:${domain}`;
}

// Pre-registered defaults
THRESHOLDS.set(thresholdKey("IVY", "dispute-resolution"), {
  agentName: "IVY",
  domain: "dispute-resolution",
  minConfidence: 0.7,
  warnConfidence: 0.8,
  autoApproveConfidence: 0.95,
});

THRESHOLDS.set(thresholdKey("FINN", "payment-recovery"), {
  agentName: "FINN",
  domain: "payment-recovery",
  minConfidence: 0.75,
  warnConfidence: 0.85,
  autoApproveConfidence: 0.95,
});

THRESHOLDS.set(thresholdKey("GABRIEL", "anomaly-detection"), {
  agentName: "GABRIEL",
  domain: "anomaly-detection",
  minConfidence: 0.6,
  warnConfidence: 0.7,
  autoApproveConfidence: 0.9,
});

export function setThreshold(config: ThresholdConfig): void {
  THRESHOLDS.set(thresholdKey(config.agentName, config.domain), config);
}

export function getThreshold(agentName: string, domain: string): ThresholdConfig {
  return THRESHOLDS.get(thresholdKey(agentName, domain)) ?? { ...DEFAULT_THRESHOLD, agentName, domain };
}

export function evaluateConfidence(
  agentName: string,
  domain: string,
  confidence: number
): ConfidenceDecision {
  const config = getThreshold(agentName, domain);
  if (confidence >= config.autoApproveConfidence) return "auto_approve";
  if (confidence >= config.warnConfidence) return "approve";
  if (confidence >= config.minConfidence) return "warn";
  return "reject";
}

export function getAllThresholds(): ThresholdConfig[] {
  return Array.from(THRESHOLDS.values());
}
