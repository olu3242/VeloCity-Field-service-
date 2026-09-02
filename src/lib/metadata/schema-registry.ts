/**
 * IDXF Engine 81 — Schema Registry.
 *
 * Versions entity metadata over time. Because IDXF generates forms, APIs and
 * validation from metadata, a metadata change is a schema change: it must be
 * versioned and diffable so a breaking change is visible before it ships.
 *
 * Snapshots are process-global metadata, not tenant rows.
 */

import { getEntityFields, type FieldMetadata } from "./field-engine";
import { getEntity } from "./entity-registry";
import { getRelationshipsFrom } from "./relationship-registry";

export interface SchemaSnapshot {
  id: string;
  entity: string;
  version: number;
  /** Order-independent digest of the entity's field surface. */
  checksum: string;
  fieldCount: number;
  relationshipCount: number;
  fields: Array<{
    name: string;
    kind: string;
    required: boolean;
    readOnly: boolean;
    targetEntity?: string;
  }>;
  capturedAt: string;
  note?: string;
}

export type SchemaChangeKind =
  | "field_added"
  | "field_removed"
  | "field_kind_changed"
  | "field_required_added"
  | "field_required_removed"
  | "field_target_changed";

export interface SchemaChange {
  kind: SchemaChangeKind;
  field: string;
  detail: string;
  /**
   * A breaking change invalidates existing rows or clients: removing a field,
   * changing its type, or newly requiring it.
   */
  breaking: boolean;
}

export interface SchemaDiff {
  entity: string;
  fromVersion: number;
  toVersion: number;
  changes: SchemaChange[];
  breakingCount: number;
  compatible: boolean;
}

const SNAPSHOTS: Map<string, SchemaSnapshot[]> = new Map();
const HISTORY_CAP = 50;

/**
 * Order-independent checksum over the field surface.
 *
 * Fields are sorted before hashing so a pure reordering of registration calls
 * does not read as a schema change.
 */
function computeChecksum(fields: FieldMetadata[]): string {
  const canonical = fields
    .map((f) =>
      [
        f.name,
        f.kind,
        f.validation.required === true ? "req" : "opt",
        f.readOnly ? "ro" : "rw",
        f.targetEntity ?? "-",
      ].join(":")
    )
    .sort()
    .join("|");

  // FNV-1a — deterministic, dependency-free, and sufficient for change detection.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toSnapshotFields(fields: FieldMetadata[]): SchemaSnapshot["fields"] {
  return fields.map((f) => ({
    name: f.name,
    kind: f.kind,
    required: f.validation.required === true,
    readOnly: f.readOnly,
    ...(f.targetEntity !== undefined ? { targetEntity: f.targetEntity } : {}),
  }));
}

/**
 * Captures the current metadata state for an entity as a new version.
 * Returns the existing head when nothing changed, so repeated calls do not
 * inflate the version history with identical snapshots.
 */
export function captureSchema(entity: string, note?: string): SchemaSnapshot {
  if (!getEntity(entity)) {
    throw new Error(`[IDXF/schema-registry] unknown entity: ${entity}`);
  }

  const fields = getEntityFields(entity);
  const checksum = computeChecksum(fields);
  const history = SNAPSHOTS.get(entity) ?? [];
  const head = history[history.length - 1];

  if (head && head.checksum === checksum) return head;

  const snapshot: SchemaSnapshot = {
    id: crypto.randomUUID(),
    entity,
    version: (head?.version ?? 0) + 1,
    checksum,
    fieldCount: fields.length,
    relationshipCount: getRelationshipsFrom(entity).length,
    fields: toSnapshotFields(fields),
    capturedAt: new Date().toISOString(),
    ...(note !== undefined ? { note } : {}),
  };

  history.push(snapshot);
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
  SNAPSHOTS.set(entity, history);
  return snapshot;
}

export function getSchemaHistory(entity: string): SchemaSnapshot[] {
  return SNAPSHOTS.get(entity) ?? [];
}

export function getSchemaVersion(entity: string, version: number): SchemaSnapshot | undefined {
  return (SNAPSHOTS.get(entity) ?? []).find((s) => s.version === version);
}

export function getCurrentSchema(entity: string): SchemaSnapshot | undefined {
  const history = SNAPSHOTS.get(entity);
  if (!history || history.length === 0) return undefined;
  return history[history.length - 1];
}

/** Compares two captured versions and classifies each change. */
export function diffSchema(entity: string, fromVersion: number, toVersion: number): SchemaDiff {
  const from = getSchemaVersion(entity, fromVersion);
  const to = getSchemaVersion(entity, toVersion);
  if (!from) throw new Error(`[IDXF/schema-registry] ${entity} has no version ${fromVersion}`);
  if (!to) throw new Error(`[IDXF/schema-registry] ${entity} has no version ${toVersion}`);

  const fromByName = new Map(from.fields.map((f) => [f.name, f]));
  const toByName = new Map(to.fields.map((f) => [f.name, f]));
  const changes: SchemaChange[] = [];

  for (const [name, field] of Array.from(toByName.entries())) {
    const before = fromByName.get(name);
    if (!before) {
      // A newly required field breaks existing rows that have no value for it.
      changes.push({
        kind: "field_added",
        field: name,
        detail: `added '${name}' (${field.kind})`,
        breaking: field.required,
      });
      continue;
    }
    if (before.kind !== field.kind) {
      changes.push({
        kind: "field_kind_changed",
        field: name,
        detail: `${before.kind} → ${field.kind}`,
        breaking: true,
      });
    }
    if (!before.required && field.required) {
      changes.push({
        kind: "field_required_added",
        field: name,
        detail: `'${name}' is now required`,
        breaking: true,
      });
    }
    if (before.required && !field.required) {
      changes.push({
        kind: "field_required_removed",
        field: name,
        detail: `'${name}' is no longer required`,
        breaking: false,
      });
    }
    if (before.targetEntity !== field.targetEntity) {
      changes.push({
        kind: "field_target_changed",
        field: name,
        detail: `${before.targetEntity ?? "-"} → ${field.targetEntity ?? "-"}`,
        breaking: true,
      });
    }
  }

  for (const name of Array.from(fromByName.keys())) {
    if (!toByName.has(name)) {
      changes.push({
        kind: "field_removed",
        field: name,
        detail: `removed '${name}'`,
        breaking: true,
      });
    }
  }

  const breakingCount = changes.filter((c) => c.breaking).length;
  return {
    entity,
    fromVersion,
    toVersion,
    changes,
    breakingCount,
    compatible: breakingCount === 0,
  };
}

/**
 * Detects entities whose live metadata has drifted from their last snapshot.
 * Drift means metadata changed without being versioned — the change is live but
 * unrecorded, so no diff exists to review.
 */
export function findUnversionedDrift(): Array<{ entity: string; currentChecksum: string; snapshotChecksum: string | null }> {
  const drifted: Array<{ entity: string; currentChecksum: string; snapshotChecksum: string | null }> = [];
  for (const entity of Array.from(SNAPSHOTS.keys())) {
    const current = computeChecksum(getEntityFields(entity));
    const head = getCurrentSchema(entity);
    if (!head || head.checksum !== current) {
      drifted.push({
        entity,
        currentChecksum: current,
        snapshotChecksum: head?.checksum ?? null,
      });
    }
  }
  return drifted;
}

export function getSchemaStats(): {
  versionedEntities: number;
  totalSnapshots: number;
  driftedEntities: number;
} {
  let totalSnapshots = 0;
  for (const history of Array.from(SNAPSHOTS.values())) {
    totalSnapshots += history.length;
  }
  return {
    versionedEntities: SNAPSHOTS.size,
    totalSnapshots,
    driftedEntities: findUnversionedDrift().length,
  };
}
