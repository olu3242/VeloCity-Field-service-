/**
 * Pipeline Monitor — tracks metrics per processing pipeline.
 * In-memory singleton with no fixed cap (pipeline count is bounded naturally).
 */

export interface PipelineMetric {
  pipelineId: string
  eventsIn: number
  eventsOut: number
  errorsCount: number
  avgProcessingMs: number
  lastUpdatedAt: string
}

const METRICS: Map<string, PipelineMetric> = new Map()

function getOrCreate(pipelineId: string): PipelineMetric {
  const existing = METRICS.get(pipelineId)
  if (existing) return existing
  const metric: PipelineMetric = {
    pipelineId,
    eventsIn: 0,
    eventsOut: 0,
    errorsCount: 0,
    avgProcessingMs: 0,
    lastUpdatedAt: new Date().toISOString(),
  }
  METRICS.set(pipelineId, metric)
  return metric
}

export function recordPipelineEvent(
  pipelineId: string,
  processingMs: number,
  isError: boolean
): void {
  const metric = getOrCreate(pipelineId)
  metric.eventsIn += 1
  if (!isError) metric.eventsOut += 1
  else metric.errorsCount += 1
  // Rolling average
  const total = metric.eventsIn
  metric.avgProcessingMs = (metric.avgProcessingMs * (total - 1) + processingMs) / total
  metric.lastUpdatedAt = new Date().toISOString()
}

export function getPipelineMetric(pipelineId: string): PipelineMetric | undefined {
  return METRICS.get(pipelineId)
}

export function getAllPipelineMetrics(): PipelineMetric[] {
  return Array.from(METRICS.values())
}

export function getHealthyPipelines(): PipelineMetric[] {
  return Array.from(METRICS.values()).filter((m) => {
    const errorRate = m.eventsIn > 0 ? m.errorsCount / m.eventsIn : 0
    return errorRate < 0.05
  })
}
