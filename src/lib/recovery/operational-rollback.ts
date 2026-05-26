import { isRuntimePaused } from "@/lib/governance/operator";

export interface RollbackPoint {
  id: string;
  label: string;
  capturedAt: string;
  configSnapshot: Record<string, unknown>;
  triggerCondition?: string;
  used: boolean;
  usedAt?: string;
}

const ROLLBACK_POINTS = new Map<string, RollbackPoint>();
const CAP = 20;

export function captureRollbackPoint(
  label: string,
  configSnapshot: Record<string, unknown>,
  triggerCondition?: string
): RollbackPoint {
  if (ROLLBACK_POINTS.size >= CAP) {
    const oldestKey = Array.from(ROLLBACK_POINTS.keys())[0];
    if (oldestKey !== undefined) ROLLBACK_POINTS.delete(oldestKey);
  }

  const id = crypto.randomUUID();
  const point: RollbackPoint = {
    id,
    label,
    capturedAt: new Date().toISOString(),
    configSnapshot,
    triggerCondition,
    used: false,
  };

  ROLLBACK_POINTS.set(id, point);
  return point;
}

export function executeRollback(id: string): {
  success: boolean;
  restoredConfig: Record<string, unknown>;
  message: string;
} {
  const point = ROLLBACK_POINTS.get(id);
  if (!point) {
    return { success: false, restoredConfig: {}, message: "Rollback point not found" };
  }

  if (isRuntimePaused()) {
    return {
      success: false,
      restoredConfig: {},
      message: "Cannot execute rollback while runtime is paused",
    };
  }

  point.used = true;
  point.usedAt = new Date().toISOString();

  return {
    success: true,
    restoredConfig: point.configSnapshot,
    message: `Rolled back to: ${point.label}`,
  };
}

export function getAvailableRollbackPoints(): RollbackPoint[] {
  return Array.from(ROLLBACK_POINTS.values())
    .filter((p) => !p.used)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export function getRecentRollbacks(limit = 10): RollbackPoint[] {
  return Array.from(ROLLBACK_POINTS.values())
    .filter((p): p is RollbackPoint & { usedAt: string } => p.used && p.usedAt !== undefined)
    .sort((a, b) => b.usedAt.localeCompare(a.usedAt))
    .slice(0, limit);
}
