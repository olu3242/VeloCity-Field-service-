/**
 * Drift Analyzer — detects stale heartbeats and state corruption.
 * In-memory singleton with rolling cap of 200 entries.
 */

import { getAllRegistryEntries, getRegistrySnapshot } from "./state-registry"

const DRIFT_CAP = 200
const STALE_THRESHOLD_MS = 60_000

export interface DriftReport {
  id: string
  component: string
  driftType: "version_mismatch" | "config_drift" | "heartbeat_stale" | "state_corruption"
  severity: "low" | "medium" | "high" | "critical"
  detail: string
  detectedAt: string
  resolved: boolean
}

const DRIFTS: DriftReport[] = []

function enforceCap(): void {
  while (DRIFTS.length > DRIFT_CAP) DRIFTS.shift()
}

export function analyzeDrift(): DriftReport[] {
  const now = Date.now()
  const newDrifts: DriftReport[] = []
  // side-effect read to confirm snapshot is accessible
  void getRegistrySnapshot()

  const entries = getAllRegistryEntries()
  for (const entry of entries) {
    const lastBeat = new Date(entry.lastHeartbeatAt).getTime()
    const ageMs = now - lastBeat
    if (ageMs > STALE_THRESHOLD_MS) {
      const existing = DRIFTS.find(
        (d) => d.component === entry.component && d.driftType === "heartbeat_stale" && !d.resolved
      )
      if (!existing) {
        const sev: DriftReport["severity"] =
          ageMs > 300_000 ? "critical" : ageMs > 120_000 ? "high" : "medium"
        const drift = reportDrift(
          entry.component,
          "heartbeat_stale",
          sev,
          `Heartbeat stale by ${Math.floor(ageMs / 1000)}s (last: ${entry.lastHeartbeatAt})`
        )
        newDrifts.push(drift)
      }
    }
  }
  return newDrifts
}

export function reportDrift(
  component: string,
  driftType: DriftReport["driftType"],
  severity: DriftReport["severity"],
  detail: string
): DriftReport {
  const report: DriftReport = {
    id: crypto.randomUUID(),
    component,
    driftType,
    severity,
    detail,
    detectedAt: new Date().toISOString(),
    resolved: false,
  }
  DRIFTS.push(report)
  enforceCap()
  return report
}

export function resolveDrift(id: string): void {
  const drift = DRIFTS.find((d) => d.id === id)
  if (drift) drift.resolved = true
}

export function getActiveDrifts(): DriftReport[] {
  return DRIFTS.filter((d) => !d.resolved)
}

export function getDriftSummary(): {
  total: number
  active: number
  bySeverity: Record<string, number>
} {
  const active = getActiveDrifts()
  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  for (const d of active) {
    bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1
  }
  return { total: DRIFTS.length, active: active.length, bySeverity }
}
