export type LogLevel = "debug" | "info" | "warn" | "error" | "critical"

export interface StructuredLog {
  id: string
  level: LogLevel
  message: string
  subsystem: string
  tenantId?: string
  traceId?: string
  correlationId?: string
  workflowId?: string
  agentName?: string
  metadata: Record<string, unknown>
  timestamp: string
}

const LOG_BUFFER: StructuredLog[] = []
const MAX_BUFFER = 2000

export function log(
  level: LogLevel,
  message: string,
  subsystem: string,
  context?: Partial<Pick<StructuredLog, "tenantId" | "traceId" | "correlationId" | "workflowId" | "agentName" | "metadata">>
): StructuredLog {
  if (LOG_BUFFER.length >= MAX_BUFFER) LOG_BUFFER.shift()
  const entry: StructuredLog = {
    id: crypto.randomUUID(),
    level,
    message,
    subsystem,
    tenantId: context?.tenantId,
    traceId: context?.traceId,
    correlationId: context?.correlationId,
    workflowId: context?.workflowId,
    agentName: context?.agentName,
    metadata: context?.metadata ?? {},
    timestamp: new Date().toISOString(),
  }
  LOG_BUFFER.push(entry)
  return entry
}

export const logger = {
  debug: (msg: string, subsystem: string, ctx?: Parameters<typeof log>[3]) => log("debug", msg, subsystem, ctx),
  info: (msg: string, subsystem: string, ctx?: Parameters<typeof log>[3]) => log("info", msg, subsystem, ctx),
  warn: (msg: string, subsystem: string, ctx?: Parameters<typeof log>[3]) => log("warn", msg, subsystem, ctx),
  error: (msg: string, subsystem: string, ctx?: Parameters<typeof log>[3]) => log("error", msg, subsystem, ctx),
  critical: (msg: string, subsystem: string, ctx?: Parameters<typeof log>[3]) => log("critical", msg, subsystem, ctx),
}

export function getLogsBySubsystem(subsystem: string, level?: LogLevel, limit = 100): StructuredLog[] {
  return LOG_BUFFER
    .filter((l) => l.subsystem === subsystem && (level === undefined || l.level === level))
    .slice(-limit)
}

export function getRecentLogs(level?: LogLevel, limit = 50): StructuredLog[] {
  const filtered = level ? LOG_BUFFER.filter((l) => l.level === level) : LOG_BUFFER
  return filtered.slice(-limit)
}

export function getLogSummary(): { total: number; byLevel: Record<string, number>; bySubsystem: Record<string, number> } {
  const byLevel: Record<string, number> = {}
  const bySubsystem: Record<string, number> = {}
  for (const l of LOG_BUFFER) {
    byLevel[l.level] = (byLevel[l.level] ?? 0) + 1
    bySubsystem[l.subsystem] = (bySubsystem[l.subsystem] ?? 0) + 1
  }
  return { total: LOG_BUFFER.length, byLevel, bySubsystem }
}
