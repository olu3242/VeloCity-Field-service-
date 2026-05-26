import { type DataCategory, getPolicy } from "./retention-policy";

export interface AuditRetentionRecord {
  id: string;
  tenantId: string;
  category: DataCategory;
  dataId: string;
  createdAt: string;
  expiresAt: string;
  archived: boolean;
  archivedAt?: string;
  purged: boolean;
  purgedAt?: string;
}

const RECORDS_CAP = 5_000;
export const RETENTION_RECORDS: Map<string, AuditRetentionRecord> = new Map<
  string,
  AuditRetentionRecord
>();

export function registerForRetention(
  tenantId: string,
  category: DataCategory,
  dataId: string
): AuditRetentionRecord {
  const policy = getPolicy(category);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + policy.retentionDays * 86_400_000
  ).toISOString();

  const record: AuditRetentionRecord = {
    id: crypto.randomUUID(),
    tenantId,
    category,
    dataId,
    createdAt: now.toISOString(),
    expiresAt,
    archived: false,
    purged: false,
  };

  if (RETENTION_RECORDS.size >= RECORDS_CAP) {
    const firstKey = RETENTION_RECORDS.keys().next().value;
    if (firstKey !== undefined) {
      RETENTION_RECORDS.delete(firstKey);
    }
  }

  RETENTION_RECORDS.set(record.id, record);
  return record;
}

export function markArchived(id: string): void {
  const record = RETENTION_RECORDS.get(id);
  if (!record) return;
  RETENTION_RECORDS.set(id, {
    ...record,
    archived: true,
    archivedAt: new Date().toISOString(),
  });
}

export function markPurged(id: string): void {
  const record = RETENTION_RECORDS.get(id);
  if (!record) return;
  RETENTION_RECORDS.set(id, {
    ...record,
    purged: true,
    purgedAt: new Date().toISOString(),
  });
}

export function getExpiredRecords(tenantId?: string): AuditRetentionRecord[] {
  const now = new Date().toISOString();
  return Array.from(RETENTION_RECORDS.values()).filter(
    (r) =>
      !r.purged &&
      r.expiresAt < now &&
      (tenantId === undefined || r.tenantId === tenantId)
  );
}

export function getPurgeDueRecords(): AuditRetentionRecord[] {
  const now = new Date().toISOString();
  return Array.from(RETENTION_RECORDS.values()).filter(
    (r) => !r.purged && r.expiresAt < now
  );
}
