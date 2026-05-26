export interface ResponseScore {
  tenantId: string;
  eventType: string;
  responseTimeMs: number;
  slaDeadlineMs: number;
  score: number;
  onTime: boolean;
  recordedAt: string;
}

export interface ResolutionAnalytics {
  eventType: string;
  avgResponseMs: number;
  p95ResponseMs: number;
  onTimeRate: number;
  avgScore: number;
  sampleCount: number;
}

const SCORES_CAP = 500;
const SAMPLES_PER_KEY_CAP = 100;

const SCORES: ResponseScore[] = [];
const RESOLUTION_SAMPLES: Map<string, number[]> = new Map();

export function scoreResponse(
  tenantId: string,
  eventType: string,
  responseTimeMs: number,
  slaDeadlineMs: number
): ResponseScore {
  const score = Math.max(0, 100 - (responseTimeMs / slaDeadlineMs) * 100);
  const onTime = responseTimeMs <= slaDeadlineMs;

  const entry: ResponseScore = {
    tenantId,
    eventType,
    responseTimeMs,
    slaDeadlineMs,
    score,
    onTime,
    recordedAt: new Date().toISOString(),
  };

  if (SCORES.length >= SCORES_CAP) SCORES.shift();
  SCORES.push(entry);

  const existing = RESOLUTION_SAMPLES.get(eventType) ?? [];
  if (existing.length >= SAMPLES_PER_KEY_CAP) existing.shift();
  existing.push(responseTimeMs);
  RESOLUTION_SAMPLES.set(eventType, existing);

  return entry;
}

export function getResolutionAnalytics(eventType: string): ResolutionAnalytics | undefined {
  const samples = RESOLUTION_SAMPLES.get(eventType);
  if (!samples || samples.length === 0) return undefined;

  const sorted = Array.from(samples).sort((a, b) => a - b);
  const avgResponseMs = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95ResponseMs = sorted[Math.min(p95Index, sorted.length - 1)];

  const eventScores = SCORES.filter((s) => s.eventType === eventType);
  const onTimeCount = eventScores.filter((s) => s.onTime).length;
  const onTimeRate = eventScores.length > 0 ? onTimeCount / eventScores.length : 0;
  const avgScore =
    eventScores.length > 0
      ? eventScores.reduce((sum, s) => sum + s.score, 0) / eventScores.length
      : 0;

  return {
    eventType,
    avgResponseMs,
    p95ResponseMs,
    onTimeRate,
    avgScore,
    sampleCount: sorted.length,
  };
}

export function getTopEventsByBreachRate(): { eventType: string; breachRate: number }[] {
  const grouped = new Map<string, ResponseScore[]>();

  for (const score of SCORES) {
    const arr = grouped.get(score.eventType) ?? [];
    arr.push(score);
    grouped.set(score.eventType, arr);
  }

  return Array.from(grouped.entries())
    .map(([eventType, scores]) => ({
      eventType,
      breachRate: scores.filter((s) => !s.onTime).length / scores.length,
    }))
    .sort((a, b) => b.breachRate - a.breachRate);
}
