import { logger } from "@/runtime-core/observability"

export type HistoryEventType =
  | "workflow_started"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_retried"
  | "workflow_suspended"
  | "workflow_resumed"
  | "variable_updated"
  | "checkpoint_saved"
  | "human_signal_received"
  | "compensation_started"
  | "compensation_completed"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled"

export interface HistoryEvent {
  eventId: string
  workflowId: string
  tenantId?: string
  sequence: number
  eventType: HistoryEventType
  stepIndex?: number
  stepName?: string
  data: Record<string, unknown>
  occurredAt: string
}

const HISTORY: Map<string, HistoryEvent[]> = new Map()
const EVENTS_PER_WORKFLOW_CAP = 500

function nextSequence(events: HistoryEvent[]): number {
  return events.length > 0 ? (events.at(-1)?.sequence ?? 0) + 1 : 1
}

export function appendEvent(
  workflowId: string,
  type: HistoryEventType,
  data: Record<string, unknown>,
  options?: { tenantId?: string; stepIndex?: number; stepName?: string },
): HistoryEvent {
  const existing = HISTORY.get(workflowId) ?? []
  if (existing.length >= EVENTS_PER_WORKFLOW_CAP) existing.shift()

  const event: HistoryEvent = {
    eventId: crypto.randomUUID(),
    workflowId,
    tenantId: options?.tenantId,
    sequence: nextSequence(existing),
    eventType: type,
    stepIndex: options?.stepIndex,
    stepName: options?.stepName,
    data,
    occurredAt: new Date().toISOString(),
  }
  existing.push(event)
  HISTORY.set(workflowId, existing)
  logger.debug(`History event: ${type}`, "temporal-history", {
    metadata: { workflowId, sequence: event.sequence },
  })
  return event
}

export function getHistory(workflowId: string): HistoryEvent[] {
  return HISTORY.get(workflowId) ?? []
}

export function getHistorySince(workflowId: string, sequence: number): HistoryEvent[] {
  return (HISTORY.get(workflowId) ?? []).filter((e) => e.sequence >= sequence)
}

export function getEventsByType(workflowId: string, type: HistoryEventType): HistoryEvent[] {
  return (HISTORY.get(workflowId) ?? []).filter((e) => e.eventType === type)
}

export function getHistorySummary(workflowId: string): {
  totalEvents: number
  lastSequence: number
  byType: Record<string, number>
} {
  const events = HISTORY.get(workflowId) ?? []
  const byType: Record<string, number> = {}
  for (const e of events) byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
  const last = events.at(-1)
  return { totalEvents: events.length, lastSequence: last?.sequence ?? 0, byType }
}
