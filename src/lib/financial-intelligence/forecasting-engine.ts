export interface FinancialForecast {
  id: string
  period: string
  metricType: "revenue" | "volume" | "disputes" | "commissions"
  forecastValue: number
  confidence: number
  trend: "up" | "down" | "flat"
  generatedAt: string
}

const FORECASTS: FinancialForecast[] = []
const FORECASTS_CAP = 100

export function generateForecast(
  metricType: FinancialForecast["metricType"],
  historicalValues: number[],
  forecastPeriod: string,
): FinancialForecast {
  const last3Avg = historicalValues.length >= 3
    ? historicalValues.slice(-3).reduce((s, v) => s + v, 0) / 3
    : historicalValues.length > 0 ? historicalValues[historicalValues.length - 1] : 0

  const prior3Avg = historicalValues.length >= 6
    ? historicalValues.slice(-6, -3).reduce((s, v) => s + v, 0) / 3
    : historicalValues.length >= 3
    ? historicalValues.slice(0, historicalValues.length - Math.min(3, historicalValues.length)).reduce((s, v) => s + v, 0) / Math.max(1, historicalValues.length - 3)
    : last3Avg

  let trend: FinancialForecast["trend"] = "flat"
  if (prior3Avg > 0) {
    const changePct = (last3Avg - prior3Avg) / prior3Avg
    if (changePct > 0.05) trend = "up"
    else if (changePct < -0.05) trend = "down"
  }

  const lastValue = historicalValues.length > 0 ? historicalValues[historicalValues.length - 1] : 0
  const multiplier = trend === "up" ? 0.08 : trend === "down" ? -0.08 : 0
  const forecastValue = lastValue * (1 + multiplier)
  const confidence = Math.min(0.9, historicalValues.length / 12)

  const forecast: FinancialForecast = {
    id: crypto.randomUUID(),
    period: forecastPeriod,
    metricType,
    forecastValue,
    confidence,
    trend,
    generatedAt: new Date().toISOString(),
  }
  FORECASTS.push(forecast)
  if (FORECASTS.length > FORECASTS_CAP) FORECASTS.splice(0, FORECASTS.length - FORECASTS_CAP)
  return forecast
}

export function getLatestForecast(metricType: FinancialForecast["metricType"]): FinancialForecast | undefined {
  return [...FORECASTS].reverse().find((f) => f.metricType === metricType)
}

export function getAllForecasts(): FinancialForecast[] {
  return [...FORECASTS]
}
