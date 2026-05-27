/**
 * Snapshot Engine — captures point-in-time runtime snapshots.
 * In-memory singleton with rolling cap of 100 entries.
 */

import { getAllCircuits } from "@/lib/governance/circuit-breaker"
import { calculateEffectiveness } from "@/lib/economy/telemetry"
import { getResilienceReport } from "@/lib/simulation/resilience-tester"
import { getRegistrySnapshot } from "./state-registry"

const SNAPSHOT_CAP = 100

export interface RuntimeSnapshot {
  id: string
  takenAt: string
  components: number
  healthy: number
  degraded: number
  critical: number
  activeCircuits: number
  openCircuits: number
  resilienceScore: number
  effectivenessScore: number
}

const SNAPSHOTS: RuntimeSnapshot[] = []

function enforceCap(): void {
  while (SNAPSHOTS.length > SNAPSHOT_CAP) SNAPSHOTS.shift()
}

export function captureSnapshot(): RuntimeSnapshot {
  const reg = getRegistrySnapshot()
  const circuits = getAllCircuits()
  const resilience = getResilienceReport()
  const effectiveness = calculateEffectiveness()

  const total = resilience.passed + resilience.failed
  const resilienceScore = total > 0 ? (resilience.passed / total) * 100 : 100

  const snapshot: RuntimeSnapshot = {
    id: crypto.randomUUID(),
    takenAt: new Date().toISOString(),
    components: reg.total,
    healthy: reg.healthy,
    degraded: reg.degraded,
    critical: reg.critical,
    activeCircuits: circuits.length,
    openCircuits: circuits.filter((c) => c.state === "open").length,
    resilienceScore,
    effectivenessScore: effectiveness.composite,
  }
  SNAPSHOTS.push(snapshot)
  enforceCap()
  return snapshot
}

export function getLatestSnapshot(): RuntimeSnapshot | undefined {
  return SNAPSHOTS[SNAPSHOTS.length - 1]
}

export function getSnapshotHistory(limit = 20): RuntimeSnapshot[] {
  return SNAPSHOTS.slice(-limit)
}

export function getSnapshotTrend(): "improving" | "stable" | "degrading" {
  if (SNAPSHOTS.length < 6) return "stable"
  const recent = SNAPSHOTS.slice(-3)
  const prior = SNAPSHOTS.slice(-6, -3)
  const avgRecent = recent.reduce((s, x) => s + x.resilienceScore, 0) / 3
  const avgPrior = prior.reduce((s, x) => s + x.resilienceScore, 0) / 3
  if (avgRecent > avgPrior + 2) return "improving"
  if (avgRecent < avgPrior - 2) return "degrading"
  return "stable"
}
