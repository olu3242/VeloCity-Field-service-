/**
 * Sync Tracker — records cross-platform sync operations.
 * Cap: 200 records. In-memory only.
 */

export interface SyncRecord {
  id: string;
  platformId: string;
  direction: "inbound" | "outbound" | "bidirectional";
  entityType: string;
  recordsSync: number;
  status: "success" | "partial" | "failed";
  syncedAt: string;
  durationMs: number;
}

const SYNC_RECORDS_CAP = 200;
export const SYNC_RECORDS: SyncRecord[] = [];

export function recordSync(
  platformId: string,
  direction: SyncRecord["direction"],
  entityType: string,
  recordsSynced: number,
  status: SyncRecord["status"],
  durationMs: number
): SyncRecord {
  if (SYNC_RECORDS.length >= SYNC_RECORDS_CAP) {
    SYNC_RECORDS.shift();
  }
  const record: SyncRecord = {
    id: crypto.randomUUID(),
    platformId,
    direction,
    entityType,
    recordsSync: recordsSynced,
    status,
    syncedAt: new Date().toISOString(),
    durationMs,
  };
  SYNC_RECORDS.push(record);
  return record;
}

export function getRecentSyncs(
  platformId?: string,
  limit = 20
): SyncRecord[] {
  const records = platformId
    ? SYNC_RECORDS.filter((r) => r.platformId === platformId)
    : SYNC_RECORDS;
  return records.slice(-limit).reverse();
}

export function getSyncStats(platformId: string): {
  totalSyncs: number;
  successRate: number;
  avgDurationMs: number;
  lastSyncAt?: string;
} {
  const records = SYNC_RECORDS.filter((r) => r.platformId === platformId);
  if (records.length === 0) {
    return { totalSyncs: 0, successRate: 0, avgDurationMs: 0 };
  }
  const totalSyncs = records.length;
  const successCount = records.filter((r) => r.status === "success").length;
  const successRate = successCount / totalSyncs;
  const avgDurationMs =
    records.reduce((sum, r) => sum + r.durationMs, 0) / totalSyncs;
  const lastSyncAt = records[records.length - 1]?.syncedAt;
  return { totalSyncs, successRate, avgDurationMs, lastSyncAt };
}
