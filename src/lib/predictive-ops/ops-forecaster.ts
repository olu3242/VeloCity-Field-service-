export interface OpsforecastRecord {
  id: string
  metric: string
  tenantId?: string
  currentValue: number
  forecast1h: number
  forecast24h: number
  forecast7d: number
  trend: "up" | "down" | "flat"
  confidence: number
  generatedAt: string
}

const FORECASTS: OpsforecastRecord[] = []
const CAP = 200

function calcTrend(historicalValues: number[]): "up" | "down" | "flat" {
  if (historicalValues.length < 2) return "flat"
  const recent = historicalValues.slice(-5)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const fullAvg = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length
  if (fullAvg === 0) return "flat"
  const changePct = ((recentAvg - fullAvg) / fullAvg) * 100
  if (changePct > 5) return "up"
  if (changePct < -5) return "down"
  return "flat"
}

export function forecastMetric(
  metric: string,
  currentValue: number,
  historicalValues: number[],
  tenantId?: string
): OpsforecastRecord {
  const trend = calcTrend(historicalValues)
  let m1h: number, m24h: number, m7d: number
  if (trend === "up") {
    m1h = currentValue * 1.05
    m24h = currentValue * 1.2
    m7d = currentValue * 1.5
  } else if (trend === "down") {
    m1h = currentValue * 0.95
    m24h = currentValue * 0.85
    m7d = currentValue * 0.7
  } else {
    m1h = currentValue
    m24h = currentValue
    m7d = currentValue
  }

  const confidence = Math.min(0.9, historicalValues.length / 20)
  const record: OpsforecastRecord = {
    id: crypto.randomUUID(),
    metric,
    tenantId,
    currentValue,
    forecast1h: m1h,
    forecast24h: m24h,
    forecast7d: m7d,
    trend,
    confidence,
    generatedAt: new Date().toISOString(),
  }

  if (FORECASTS.length >= CAP) FORECASTS.shift()
  FORECASTS.push(record)
  return record
}

export function getLatestForecast(metric: string, tenantId?: string): OpsforecastRecord | undefined {
  const filtered = FORECASTS.filter(
    f => f.metric === metric && (tenantId === undefined || f.tenantId === tenantId)
  )
  return filtered[filtered.length - 1]
}

export function getCriticalForecasts(): OpsforecastRecord[] {
  return FORECASTS.filter(f => {
    if (f.currentValue === 0) return false
    const deviation = Math.abs(f.forecast1h - f.currentValue) / f.currentValue
    return deviation > 0.5
  })
}
