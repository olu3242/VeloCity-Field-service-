/**
 * Workflow Packet — wire-format for inter-service workflow messages.
 */

export type PacketType =
  | "workflow_start"
  | "workflow_step"
  | "workflow_complete"
  | "workflow_fail"
  | "workflow_compensate"
  | "checkpoint_save"
  | "checkpoint_restore"
  | "handoff_request"
  | "handoff_accept"
  | "handoff_reject"
  | "acknowledgement"
  | "heartbeat"

export interface WorkflowPacket<T extends Record<string, unknown> = Record<string, unknown>> {
  packetId: string
  packetType: PacketType
  protocolVersion: "1.0"
  workflowId: string
  correlationId: string
  causationId?: string
  traceId: string
  tenantId?: string
  sourceNode: string
  targetNode?: string
  stepIndex: number
  payload: T
  checksum?: string
  emittedAt: string
  expiresAt?: string
}

interface PacketOptions<T> {
  correlationId?: string
  causationId?: string
  traceId?: string
  tenantId?: string
  targetNode?: string
  stepIndex?: number
  expiresAt?: string
  checksum?: string
  payload?: T
}

export function createPacket<T extends Record<string, unknown> = Record<string, unknown>>(
  type: PacketType,
  workflowId: string,
  sourceNode: string,
  payload: T,
  options?: Omit<PacketOptions<T>, "payload">
): WorkflowPacket<T> {
  return {
    packetId: crypto.randomUUID(),
    packetType: type,
    protocolVersion: "1.0",
    workflowId,
    correlationId: options?.correlationId ?? crypto.randomUUID(),
    causationId: options?.causationId,
    traceId: options?.traceId ?? crypto.randomUUID(),
    tenantId: options?.tenantId,
    sourceNode,
    targetNode: options?.targetNode,
    stepIndex: options?.stepIndex ?? 0,
    payload,
    checksum: options?.checksum,
    emittedAt: new Date().toISOString(),
    expiresAt: options?.expiresAt,
  }
}

export function isExpired(packet: WorkflowPacket): boolean {
  if (!packet.expiresAt) return false
  return new Date(packet.expiresAt) < new Date()
}

export function acknowledge(
  packet: WorkflowPacket,
  targetNode: string
): WorkflowPacket {
  return createPacket(
    "acknowledgement",
    packet.workflowId,
    targetNode,
    { acknowledgedPacketId: packet.packetId },
    {
      correlationId: packet.correlationId,
      causationId: packet.packetId,
      traceId: packet.traceId,
      tenantId: packet.tenantId,
      targetNode: packet.sourceNode,
      stepIndex: packet.stepIndex,
    }
  )
}
