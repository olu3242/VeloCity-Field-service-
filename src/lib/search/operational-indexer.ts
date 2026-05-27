import { randomUUID } from "crypto";

export type SearchableEntityType =
  | "event"
  | "workflow"
  | "audit"
  | "recommendation"
  | "incident";

export interface SearchIndex {
  id: string;
  entityType: SearchableEntityType;
  entityId: string;
  tenantId: string;
  title: string;
  content: string;
  tags: string[];
  indexedAt: string;
}

const MAX_INDEX = 5000;

export const INDEX: SearchIndex[] = [];
export const TENANT_BOUNDARY: Map<string, Set<string>> = new Map<
  string,
  Set<string>
>();

export function indexEntity(
  entity: Omit<SearchIndex, "id" | "indexedAt">
): SearchIndex {
  const full: SearchIndex = {
    id: randomUUID(),
    indexedAt: new Date().toISOString(),
    ...entity,
  };
  INDEX.push(full);
  if (INDEX.length > MAX_INDEX) {
    INDEX.shift();
  }
  const tenantSet = TENANT_BOUNDARY.get(entity.tenantId) ?? new Set<string>();
  tenantSet.add(entity.entityId);
  TENANT_BOUNDARY.set(entity.tenantId, tenantSet);
  return full;
}

export function removeFromIndex(entityId: string, tenantId: string): void {
  const idx = INDEX.findIndex(
    (e) => e.entityId === entityId && e.tenantId === tenantId
  );
  if (idx !== -1) {
    INDEX.splice(idx, 1);
  }
  const tenantSet = TENANT_BOUNDARY.get(tenantId);
  if (tenantSet !== undefined) {
    tenantSet.delete(entityId);
  }
}

export function getIndexStats(): {
  total: number;
  byEntityType: Record<string, number>;
  byTenant: Record<string, number>;
} {
  const byEntityType: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  for (const entry of INDEX) {
    byEntityType[entry.entityType] =
      (byEntityType[entry.entityType] ?? 0) + 1;
    byTenant[entry.tenantId] = (byTenant[entry.tenantId] ?? 0) + 1;
  }
  return { total: INDEX.length, byEntityType, byTenant };
}
