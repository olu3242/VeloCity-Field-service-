/**
 * IDXF Engine 79 — Cross-Record Validation.
 *
 * Checks that need to look beyond the record being saved: does the referenced
 * row exist, is it active, does it belong to this tenant, would this write
 * violate uniqueness.
 *
 * Every check takes an explicit resolver rather than importing a database
 * client. The caller already holds a tenant-scoped client, so keeping the query
 * there keeps tenant isolation with the code that owns it — and makes these
 * checks synchronously testable.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import { getEntity } from "@/lib/metadata/entity-registry";
import { getReferenceFields, type FieldMetadata } from "@/lib/metadata/field-engine";

/** A row as seen by cross-record checks — only the fields they need. */
export interface ReferencedRow {
  id: string;
  tenantId?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Loads a referenced row by entity and id.
 * MUST already be tenant-scoped by the caller. Returning null means "not
 * visible to this tenant" as well as "does not exist" — the two are
 * deliberately indistinguishable so a probe cannot confirm another tenant's ids.
 */
export type ReferenceResolver = (
  entityKey: string,
  id: string
) => ReferencedRow | null;

/** Counts rows matching a field value, excluding an id. Used for uniqueness. */
export type UniquenessResolver = (
  entityKey: string,
  field: string,
  value: unknown,
  excludeId?: string
) => number;

export type CrossRecordSeverity = "error" | "warning";

export interface CrossRecordIssue {
  field: string;
  code:
    | "reference_missing"
    | "reference_inactive"
    | "reference_cross_tenant"
    | "duplicate_value"
    | "self_reference";
  severity: CrossRecordSeverity;
  message: string;
}

export interface CrossRecordOptions {
  resolveReference?: ReferenceResolver;
  resolveUniqueness?: UniquenessResolver;
  /** Fields that must hold a value unique within the entity. */
  uniqueFields?: string[];
  /** The record's own id, so uniqueness ignores the row being edited. */
  recordId?: string;
  /** Tenant the write is executing under. */
  tenantId: string;
}

/**
 * Validates every reference field on a record.
 *
 * Without a resolver, reference checks are skipped and reported as such rather
 * than silently passing — a caller that forgot to supply one would otherwise
 * believe its references were verified.
 */
export function validateReferences(
  entityKey: string,
  record: Record<string, unknown>,
  options: CrossRecordOptions
): { issues: CrossRecordIssue[]; checked: string[]; skipped: string[] } {
  const issues: CrossRecordIssue[] = [];
  const checked: string[] = [];
  const skipped: string[] = [];

  const referenceFields: FieldMetadata[] = getReferenceFields(entityKey);

  for (const field of referenceFields) {
    const value = record[field.name];
    // An absent reference is the required-check's concern, not this one's.
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string") continue;

    if (!options.resolveReference) {
      skipped.push(field.name);
      continue;
    }

    const targetEntity = field.targetEntity;
    if (!targetEntity) continue;

    // A row pointing at itself creates a lineage loop the related engine would
    // walk forever.
    if (options.recordId && value === options.recordId && targetEntity === entityKey) {
      issues.push({
        field: field.name,
        code: "self_reference",
        severity: "error",
        message: `'${field.name}' points at its own record.`,
      });
      continue;
    }

    const row = options.resolveReference(targetEntity, value);
    checked.push(field.name);

    if (!row) {
      issues.push({
        field: field.name,
        code: "reference_missing",
        severity: "error",
        message: `'${field.name}' references a ${targetEntity} that does not exist or is not visible to this tenant.`,
      });
      continue;
    }

    // Defence in depth: the resolver should already be tenant-scoped, but if a
    // row arrives carrying a different tenant it is a hard isolation failure.
    if (row.tenantId !== undefined && row.tenantId !== options.tenantId) {
      issues.push({
        field: field.name,
        code: "reference_cross_tenant",
        severity: "error",
        message: `'${field.name}' references a ${targetEntity} belonging to another tenant.`,
      });
      continue;
    }

    if (field.validation.activeOnly) {
      const definition = getEntity(targetEntity);
      const active = definition?.activeStatuses ?? [];
      if (row.status !== undefined && active.length > 0 && !active.includes(row.status)) {
        issues.push({
          field: field.name,
          code: "reference_inactive",
          severity: "error",
          message: `'${field.name}' references a ${targetEntity} with status '${row.status}', which is not active.`,
        });
      }
    }
  }

  return { issues, checked, skipped };
}

/** Validates uniqueness constraints across the entity. */
export function validateUniqueness(
  entityKey: string,
  record: Record<string, unknown>,
  options: CrossRecordOptions
): { issues: CrossRecordIssue[]; checked: string[]; skipped: string[] } {
  const issues: CrossRecordIssue[] = [];
  const checked: string[] = [];
  const skipped: string[] = [];

  const fields = options.uniqueFields ?? [];
  for (const field of fields) {
    const value = record[field];
    if (value === null || value === undefined || value === "") continue;

    if (!options.resolveUniqueness) {
      skipped.push(field);
      continue;
    }

    const count = options.resolveUniqueness(entityKey, field, value, options.recordId);
    checked.push(field);
    if (count > 0) {
      issues.push({
        field,
        code: "duplicate_value",
        severity: "error",
        message: `Another ${entityKey} already uses ${field} '${String(value)}'.`,
      });
    }
  }

  return { issues, checked, skipped };
}

export interface CrossRecordResult {
  entity: string;
  issues: CrossRecordIssue[];
  errorCount: number;
  warningCount: number;
  /** Fields actually verified against stored data. */
  checkedFields: string[];
  /**
   * Fields that could not be verified because no resolver was supplied.
   * Non-empty means the cross-record pass was partial, not clean.
   */
  skippedFields: string[];
  complete: boolean;
}

export function runCrossRecordValidation(
  entityKey: string,
  record: Record<string, unknown>,
  options: CrossRecordOptions
): CrossRecordResult {
  const references = validateReferences(entityKey, record, options);
  const uniqueness = validateUniqueness(entityKey, record, options);

  const issues = [...references.issues, ...uniqueness.issues];
  const skippedFields = [...references.skipped, ...uniqueness.skipped];

  return {
    entity: entityKey,
    issues,
    errorCount: issues.filter((i) => i.severity === "error").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
    checkedFields: [...references.checked, ...uniqueness.checked],
    skippedFields,
    complete: skippedFields.length === 0,
  };
}
