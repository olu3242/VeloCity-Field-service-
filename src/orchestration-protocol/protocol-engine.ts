/**
 * Protocol Engine — processes and routes workflow packets.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { type PacketType, type WorkflowPacket } from "./workflow-packet"

export type ProtocolHandlerFn = (packet: WorkflowPacket) => Promise<void>

export interface ProtocolRoute {
  packetType: PacketType
  handler: ProtocolHandlerFn
  registeredAt: string
}

const ROUTES: Map<PacketType, ProtocolRoute> = new Map()

let totalDispatched = 0
let totalFailed = 0
const dispatchCounts: Record<string, number> = {}

export function registerHandler(packetType: PacketType, handler: ProtocolHandlerFn): void {
  const route: ProtocolRoute = {
    packetType,
    handler,
    registeredAt: new Date().toISOString(),
  }
  ROUTES.set(packetType, route)
  logger.info(`Protocol handler registered: ${packetType}`, "protocol-engine")
}

export async function dispatch(
  packet: WorkflowPacket
): Promise<{ dispatched: boolean; error?: string }> {
  if (isRuntimePaused()) {
    logger.warn("dispatch blocked — runtime paused", "protocol-engine", {
      metadata: { packetType: packet.packetType, packetId: packet.packetId },
    })
    return { dispatched: false, error: "runtime paused" }
  }

  const route = ROUTES.get(packet.packetType)
  if (!route) {
    logger.warn(`No handler for packet type: ${packet.packetType}`, "protocol-engine")
    return { dispatched: false, error: `no handler for ${packet.packetType}` }
  }

  try {
    await route.handler(packet)
    totalDispatched++
    dispatchCounts[packet.packetType] = (dispatchCounts[packet.packetType] ?? 0) + 1
    return { dispatched: true }
  } catch (err: unknown) {
    totalFailed++
    const error = err instanceof Error ? err.message : String(err)
    logger.error(`Dispatch failed for ${packet.packetType}: ${error}`, "protocol-engine", {
      metadata: { packetId: packet.packetId },
    })
    return { dispatched: false, error }
  }
}

export function getRegisteredTypes(): PacketType[] {
  return Array.from(ROUTES.keys())
}

export function getProtocolStats(): {
  totalDispatched: number
  totalFailed: number
  byType: Record<string, number>
} {
  return {
    totalDispatched,
    totalFailed,
    byType: { ...dispatchCounts },
  }
}
