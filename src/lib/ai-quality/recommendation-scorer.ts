export interface RecommendationQuality {
  recommendationId: string;
  agentName: string;
  domain: string;
  confidenceScore: number;
  calibrationScore: number;
  finalScore: number;
  approved: boolean;
  threshold: number;
}

const CALIBRATION: Map<string, number> = new Map();
let threshold = 0.65;

function calibrationKey(agentName: string, domain: string): string {
  return `${agentName}:${domain}`;
}

export function scoreRecommendation(
  recommendationId: string,
  agentName: string,
  domain: string,
  confidenceScore: number
): RecommendationQuality {
  const key = calibrationKey(agentName, domain);
  const calibrationScore = CALIBRATION.get(key) ?? 0.8;
  const finalScore = confidenceScore * 0.4 + calibrationScore * 0.6;
  const approved = finalScore >= threshold;

  return {
    recommendationId,
    agentName,
    domain,
    confidenceScore,
    calibrationScore,
    finalScore,
    approved,
    threshold,
  };
}

export function updateCalibration(
  agentName: string,
  domain: string,
  newAccuracy: number
): void {
  const key = calibrationKey(agentName, domain);
  const existing = CALIBRATION.get(key) ?? 0.8;
  const updated = existing * 0.7 + newAccuracy * 0.3;
  CALIBRATION.set(key, updated);
}

export function getCalibrationReport(): {
  agentName: string;
  domain: string;
  calibration: number;
}[] {
  return Array.from(CALIBRATION.entries()).map(([key, calibration]) => {
    const colonIdx = key.indexOf(":");
    return {
      agentName: key.slice(0, colonIdx),
      domain: key.slice(colonIdx + 1),
      calibration,
    };
  });
}

export function getThreshold(): number {
  return threshold;
}

export function setThreshold(t: number): void {
  threshold = t;
}
