import { isRuntimePaused, getOperatorState } from "@/lib/governance/operator"
import { getAllCircuits } from "@/lib/governance/circuit-breaker"
import { calculateEffectiveness } from "@/lib/economy/telemetry"
import { scoreOperationalReadiness } from "@/lib/maturity/readiness-scorer"

export interface OSStatus {
  version: string
  buildId: string
  startedAt: string
  uptime: number
  mode: "normal" | "degraded" | "maintenance" | "emergency"
  activeSubsystems: string[]
  inactiveSubsystems: string[]
  healthScore: number
}

const START_TIME = Date.now()
const START_ISO = new Date(START_TIME).toISOString()

const KNOWN_SUBSYSTEMS = [
  "governance",
  "orchestration",
  "ai-dispatch",
  "queue-fabric",
  "telemetry",
  "federation",
  "treasury",
  "resilience",
]

export function getOSStatus(): OSStatus {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000)
  const openCircuits = getAllCircuits().filter((c) => c.state === "open")
  const paused = isRuntimePaused()
  const opState = getOperatorState()

  const mode: OSStatus["mode"] = paused
    ? "maintenance"
    : openCircuits.length > 3
    ? "emergency"
    : openCircuits.length > 0
    ? "degraded"
    : "normal"

  const inactiveSubsystems = openCircuits.map((c) => c.key).slice(0, KNOWN_SUBSYSTEMS.length)
  const activeSubsystems = KNOWN_SUBSYSTEMS.filter((s) => !inactiveSubsystems.includes(s))

  const effectiveness = calculateEffectiveness().composite
  const readiness = scoreOperationalReadiness().composite
  const healthScore = Math.round((effectiveness + readiness) / 2)

  void opState

  return {
    version: "1.0.0",
    buildId: "velocity-os-prod",
    startedAt: START_ISO,
    uptime,
    mode,
    activeSubsystems,
    inactiveSubsystems,
    healthScore,
  }
}

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - START_TIME) / 1000)
}

export function isSubsystemActive(subsystem: string): boolean {
  const status = getOSStatus()
  return status.activeSubsystems.includes(subsystem)
}
