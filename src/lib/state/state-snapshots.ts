/**
 * State Snapshots — captures point-in-time state of workflows.
 * Cap: 20 snapshots per workflow.
 */

export interface StateSnapshot {
  id: string;
  workflowId: string;
  tenantId: string;
  step: number;
  state: Record<string, unknown>;
  takenAt: string;
  reason: string;
}

export const SNAPSHOTS: Map<string, StateSnapshot[]> = new Map();
const SNAPSHOT_CAP = 20;

export function takeSnapshot(
  workflowId: string,
  tenantId: string,
  step: number,
  state: Record<string, unknown>,
  reason: string
): StateSnapshot {
  const snapshot: StateSnapshot = {
    id: crypto.randomUUID(),
    workflowId,
    tenantId,
    step,
    state,
    takenAt: new Date().toISOString(),
    reason,
  };

  const existing = SNAPSHOTS.get(workflowId) ?? [];
  const updated = [...existing, snapshot];

  if (updated.length > SNAPSHOT_CAP) {
    updated.splice(0, updated.length - SNAPSHOT_CAP);
  }

  SNAPSHOTS.set(workflowId, updated);
  return snapshot;
}

export function getSnapshots(workflowId: string): StateSnapshot[] {
  return SNAPSHOTS.get(workflowId) ?? [];
}

export function getLatestSnapshot(
  workflowId: string
): StateSnapshot | undefined {
  const snapshots = SNAPSHOTS.get(workflowId);
  if (!snapshots || snapshots.length === 0) return undefined;
  return snapshots[snapshots.length - 1];
}

export function restoreFromSnapshot(
  workflowId: string,
  snapshotId: string
): StateSnapshot | undefined {
  const snapshots = SNAPSHOTS.get(workflowId);
  if (!snapshots) return undefined;
  return snapshots.find((s) => s.id === snapshotId);
}
