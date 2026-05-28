/**
 * Runtime Kernel — central singleton managing kernel state, boot sequence,
 * and subsystem coordination.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type KernelPhase = "booting" | "ready" | "degraded" | "halting" | "halted"

export interface KernelState {
  kernelId: string
  phase: KernelPhase
  bootedAt: string
  uptimeSeconds: number
  registeredCapabilities: number
  activeExecutions: number
  totalExecutionsProcessed: number
  lastHeartbeatAt: string
}

interface KernelInternal extends KernelState {
  bootTimestamp: number
}

const kernel: KernelInternal = {
  kernelId: crypto.randomUUID(),
  phase: "booting",
  bootedAt: new Date().toISOString(),
  bootTimestamp: Date.now(),
  uptimeSeconds: 0,
  registeredCapabilities: 0,
  activeExecutions: 0,
  totalExecutionsProcessed: 0,
  lastHeartbeatAt: new Date().toISOString(),
}

// Transition to ready on module load
kernel.phase = "ready"
logger.info("Kernel booted", "runtime-kernel", { metadata: { kernelId: kernel.kernelId } })

export function getKernelState(): KernelState {
  return {
    kernelId: kernel.kernelId,
    phase: kernel.phase,
    bootedAt: kernel.bootedAt,
    uptimeSeconds: kernel.uptimeSeconds,
    registeredCapabilities: kernel.registeredCapabilities,
    activeExecutions: kernel.activeExecutions,
    totalExecutionsProcessed: kernel.totalExecutionsProcessed,
    lastHeartbeatAt: kernel.lastHeartbeatAt,
  }
}

export function transitionPhase(phase: KernelPhase): void {
  if ((phase === "halting" || phase === "halted") && isRuntimePaused()) {
    logger.warn("Kernel phase transition blocked — runtime paused", "runtime-kernel", {
      metadata: { requestedPhase: phase },
    })
    return
  }
  const prev = kernel.phase
  kernel.phase = phase
  logger.info(`Kernel phase: ${prev} → ${phase}`, "runtime-kernel", {
    metadata: { kernelId: kernel.kernelId, phase },
  })
}

export function heartbeat(): void {
  kernel.lastHeartbeatAt = new Date().toISOString()
  kernel.uptimeSeconds = Math.floor((Date.now() - kernel.bootTimestamp) / 1000)
}

export function incrementExecution(): void {
  kernel.activeExecutions++
}

export function decrementExecution(): void {
  if (kernel.activeExecutions > 0) kernel.activeExecutions--
  kernel.totalExecutionsProcessed++
}

export function getTotalProcessed(): number {
  return kernel.totalExecutionsProcessed
}

/** Internal — used by capability-registry to keep count in sync */
export function setRegisteredCapabilities(count: number): void {
  kernel.registeredCapabilities = count
}
