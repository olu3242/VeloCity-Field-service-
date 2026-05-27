export interface DisputeAbuseSignal {
  tenantId: string;
  customerId?: string;
  recentDisputeCount: number;
  totalDisputeCount: number;
  winRate: number;
  avgDisputeAmountUsd: number;
}

export interface AbuseDetectionResult {
  entityId: string;
  abuseScore: number;
  abuseType?: "dispute_farming" | "chargeback_fraud" | "serial_disputer";
  flagged: boolean;
  recommendation: string;
}

export function detectDisputeAbuse(
  entityId: string,
  signal: DisputeAbuseSignal
): AbuseDetectionResult {
  let score = 0;

  if (signal.recentDisputeCount > 5) {
    score += 40;
  } else if (signal.recentDisputeCount > 2) {
    score += 20;
  }

  if (signal.winRate > 0.9 && signal.recentDisputeCount > 3) {
    score += 30;
  }

  if (signal.avgDisputeAmountUsd < 50 && signal.recentDisputeCount > 5) {
    score += 20;
  }

  if (signal.totalDisputeCount > 20) {
    score += 10;
  }

  const flagged = score >= 40;

  let abuseType: AbuseDetectionResult["abuseType"];
  if (signal.winRate > 0.9 && score > 50) {
    abuseType = "dispute_farming";
  } else if (signal.avgDisputeAmountUsd < 50) {
    abuseType = "chargeback_fraud";
  } else if (signal.totalDisputeCount > 20) {
    abuseType = "serial_disputer";
  }

  const recommendation =
    abuseType === "dispute_farming"
      ? "Suspend dispute privileges and escalate for manual review"
      : abuseType === "chargeback_fraud"
      ? "Flag account for payment fraud investigation"
      : abuseType === "serial_disputer"
      ? "Require additional verification before future disputes"
      : flagged
      ? "Monitor closely and review dispute patterns"
      : "No action required";

  return { entityId, abuseScore: score, abuseType, flagged, recommendation };
}

export function batchDetect(
  signals: Array<{ entityId: string; signal: DisputeAbuseSignal }>
): AbuseDetectionResult[] {
  return signals.map(({ entityId, signal }) =>
    detectDisputeAbuse(entityId, signal)
  );
}
