export interface OperationalForecast {
  id: string;
  metric: string;
  currentValue: number;
  projectedValue: number;
  projectionWindowDays: number;
  confidence: number;
  trend: "up" | "down" | "flat";
  generatedAt: string;
}

const FORECASTS: OperationalForecast[] = [];
const CAP = 200;

function computeTrend(historicalValues: number[]): "up" | "down" | "flat" {
  if (historicalValues.length < 6) return "flat";
  const recent = historicalValues.slice(-3);
  const prior = historicalValues.slice(-6, -3);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const priorAvg = prior.reduce((s, v) => s + v, 0) / prior.length;
  if (priorAvg === 0) return "flat";
  const diff = (recentAvg - priorAvg) / Math.abs(priorAvg);
  if (diff > 0.05) return "up";
  if (diff < -0.05) return "down";
  return "flat";
}

export function generateForecast(
  metric: string,
  currentValue: number,
  historicalValues: number[],
  windowDays: number
): OperationalForecast {
  const trend = computeTrend(historicalValues);
  const trendMultiplier = trend === "up" ? 0.1 : trend === "down" ? -0.1 : 0;
  const projectedValue = currentValue * (1 + trendMultiplier);
  const confidence = Math.min(0.95, historicalValues.length / 10);

  const forecast: OperationalForecast = {
    id: crypto.randomUUID(),
    metric,
    currentValue,
    projectedValue,
    projectionWindowDays: windowDays,
    confidence,
    trend,
    generatedAt: new Date().toISOString(),
  };

  FORECASTS.push(forecast);
  if (FORECASTS.length > CAP) {
    FORECASTS.splice(0, FORECASTS.length - CAP);
  }
  return forecast;
}

export function getLatestForecast(metric: string): OperationalForecast | undefined {
  const matches = FORECASTS.filter((f) => f.metric === metric);
  return matches.length > 0 ? matches[matches.length - 1] : undefined;
}

export function getAllForecasts(): OperationalForecast[] {
  return [...FORECASTS];
}
