import { logger } from "@/runtime-core/observability"

export interface ExecutionIntelligenceAggregate {
  aggregateId: string
  timeWindow: string
  region?: string
  tenantId?: string
  totalExecutions: number
  successRate: number
  avgDurationMs: number
  p99DurationMs: number
  topWorkflowTypes: string[]
  anomalyCount: number
  cognitionInsights: number
  generatedAt: string
}

const AGGREGATES: ExecutionIntelligenceAggregate[] = []
const MAX_AGGREGATES = 200

function cap(): void {
  while (AGGREGATES.length > MAX_AGGREGATES) AGGREGATES.shift()
}

export function aggregateExecutionIntelligence(
  timeWindow: string,
  executions: number,
  successRate: number,
  avgMs: number,
  p99Ms: number,
  topTypes: string[],
  anomalies: number,
  insights: number,
  region?: string,
  tenantId?: string,
): ExecutionIntelligenceAggregate {
  const aggregate: ExecutionIntelligenceAggregate = {
    aggregateId: crypto.randomUUID(),
    timeWindow,
    region,
    tenantId,
    totalExecutions: executions,
    successRate: Math.max(0, Math.min(1, successRate)),
    avgDurationMs: avgMs,
    p99DurationMs: p99Ms,
    topWorkflowTypes: [...topTypes],
    anomalyCount: anomalies,
    cognitionInsights: insights,
    generatedAt: new Date().toISOString(),
  }
  AGGREGATES.push(aggregate)
  cap()
  logger.info(
    `Execution intelligence aggregated: ${timeWindow}`,
    "execution-intelligence-cloud",
    { metadata: { aggregateId: aggregate.aggregateId, executions, anomalies } },
  )
  return aggregate
}

export function getLatestAggregate(
  region?: string,
  tenantId?: string,
): ExecutionIntelligenceAggregate | undefined {
  return [...AGGREGATES]
    .reverse()
    .find(
      (a) =>
        (region === undefined || a.region === region) &&
        (tenantId === undefined || a.tenantId === tenantId),
    )
}

export function getAggregateHistory(
  limit = 50,
): ExecutionIntelligenceAggregate[] {
  return AGGREGATES.slice(-limit)
}

export function getIntelligenceSummary(): {
  totalAggregates: number
  avgSuccessRate: number
  totalAnomalies: number
} {
  const totalAggregates = AGGREGATES.length
  const avgSuccessRate =
    totalAggregates > 0
      ? AGGREGATES.reduce((s, a) => s + a.successRate, 0) / totalAggregates
      : 0
  const totalAnomalies = AGGREGATES.reduce((s, a) => s + a.anomalyCount, 0)
  return { totalAggregates, avgSuccessRate, totalAnomalies }
}
