/**
 * IDXF Engine 81 — Universal Field Metadata Engine (UFME).
 *
 * Every field in the platform is described as metadata rather than hand-built UI.
 * The runtime reads these descriptors to generate lookups, related-record views,
 * calculations, validation, forms, defaults and AI assistance automatically.
 *
 * This module owns the field type system and the per-entity field registry.
 * It holds no tenant data — metadata describes the shape of entities, not their
 * rows — so it is a process-global registry with no tenant dimension.
 */

// ── Field type system ─────────────────────────────────────────────────────

export type BasicFieldKind =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "percentage";

export type ReferenceFieldKind =
  | "lookup"
  | "parent"
  | "child"
  | "many_to_many";

export type CalculatedFieldKind =
  | "formula"
  | "aggregate"
  | "kpi"
  | "score";

export type MediaFieldKind =
  | "image"
  | "video"
  | "signature"
  | "attachment";

export type LocationFieldKind =
  | "gps"
  | "address"
  | "territory";

export type AIFieldKind =
  | "ai_prompt"
  | "ai_summary"
  | "ai_confidence"
  | "ai_recommendation";

export type FieldKind =
  | BasicFieldKind
  | ReferenceFieldKind
  | CalculatedFieldKind
  | MediaFieldKind
  | LocationFieldKind
  | AIFieldKind;

export const BASIC_FIELD_KINDS: BasicFieldKind[] = [
  "text", "number", "currency", "date", "boolean", "percentage",
];
export const REFERENCE_FIELD_KINDS: ReferenceFieldKind[] = [
  "lookup", "parent", "child", "many_to_many",
];
export const CALCULATED_FIELD_KINDS: CalculatedFieldKind[] = [
  "formula", "aggregate", "kpi", "score",
];
export const MEDIA_FIELD_KINDS: MediaFieldKind[] = [
  "image", "video", "signature", "attachment",
];
export const LOCATION_FIELD_KINDS: LocationFieldKind[] = [
  "gps", "address", "territory",
];
export const AI_FIELD_KINDS: AIFieldKind[] = [
  "ai_prompt", "ai_summary", "ai_confidence", "ai_recommendation",
];

export const ALL_FIELD_KINDS: FieldKind[] = [
  ...BASIC_FIELD_KINDS,
  ...REFERENCE_FIELD_KINDS,
  ...CALCULATED_FIELD_KINDS,
  ...MEDIA_FIELD_KINDS,
  ...LOCATION_FIELD_KINDS,
  ...AI_FIELD_KINDS,
];

export function isReferenceKind(kind: FieldKind): kind is ReferenceFieldKind {
  return (REFERENCE_FIELD_KINDS as FieldKind[]).includes(kind);
}

export function isCalculatedKind(kind: FieldKind): kind is CalculatedFieldKind {
  return (CALCULATED_FIELD_KINDS as FieldKind[]).includes(kind);
}

export function isNumericKind(kind: FieldKind): boolean {
  return (
    kind === "number" ||
    kind === "currency" ||
    kind === "percentage" ||
    kind === "formula" ||
    kind === "aggregate" ||
    kind === "kpi" ||
    kind === "score" ||
    kind === "ai_confidence"
  );
}

// ── Field descriptors ─────────────────────────────────────────────────────

/** Declarative validation attached to a field. Evaluated by Engine 79. */
export interface FieldValidationSpec {
  /** Value must be present and non-empty. */
  required?: boolean;
  /** Inclusive numeric bounds. */
  min?: number;
  max?: number;
  /** String length bounds. */
  minLength?: number;
  maxLength?: number;
  /** Named format check — see validation-engine FORMAT_VALIDATORS. */
  format?: "email" | "phone" | "url" | "uuid" | "iso_date" | "postal_code";
  /** For reference fields: only resolve to rows whose status is active. */
  activeOnly?: boolean;
  /** Business rule ids that must pass — see business-rules registry. */
  businessRules?: string[];
}

/** Aggregate specification for `aggregate` fields. */
export interface AggregateSpec {
  /** Relationship name on the owning entity to walk. */
  relationship: string;
  /** Aggregate function applied over the related rows. */
  fn: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";
  /** Field on the related entity to aggregate. COUNT may omit it. */
  field?: string;
}

export interface FieldMetadata {
  /** Machine name, unique within its entity. */
  name: string;
  /** Owning entity key. */
  entity: string;
  kind: FieldKind;
  label: string;
  description?: string;

  /** For reference kinds — the entity being pointed at. */
  targetEntity?: string;

  /** Participates in Universal Lookup (Engine 77) search. */
  searchable: boolean;
  /** Surfaced by the Related Records Engine (Engine 76). */
  related: boolean;
  /** AI Data Assistant (Engine 89) may suggest values for this field. */
  aiSuggestions: boolean;

  /** Formula source for `formula`/`kpi`/`score` kinds — parsed by Engine 80. */
  formula?: string;
  /** Aggregate spec for `aggregate` kind. */
  aggregate?: AggregateSpec;
  /** Smart default rule id — resolved by Engine 85. */
  defaultRule?: string;

  validation: FieldValidationSpec;

  /** Layout grouping used by the form runtime (Engine 82). */
  group: string;
  /** Sort order within the group. */
  order: number;
  /** Field carries sensitive data — masked unless the persona permits it. */
  sensitive: boolean;
  /** Field is computed and must never be written directly. */
  readOnly: boolean;
}

/** Input shape for registration — everything optional except identity. */
export interface FieldMetadataInput {
  name: string;
  entity: string;
  kind: FieldKind;
  label?: string;
  description?: string;
  targetEntity?: string;
  searchable?: boolean;
  related?: boolean;
  aiSuggestions?: boolean;
  formula?: string;
  aggregate?: AggregateSpec;
  defaultRule?: string;
  validation?: FieldValidationSpec;
  group?: string;
  order?: number;
  sensitive?: boolean;
  readOnly?: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────

/** entity key → (field name → metadata) */
const FIELDS: Map<string, Map<string, FieldMetadata>> = new Map();

function humanize(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Validates a field descriptor against the invariants the runtime depends on.
 * Returns an error string, or null when the descriptor is sound.
 */
export function validateFieldMetadata(input: FieldMetadataInput): string | null {
  if (!input.name || input.name.trim() === "") return "field name is required";
  if (!input.entity || input.entity.trim() === "") return "field entity is required";
  if (!ALL_FIELD_KINDS.includes(input.kind)) {
    return `unknown field kind: ${String(input.kind)}`;
  }

  // Reference fields are meaningless without a target — the lookup and related
  // engines would have nothing to resolve against.
  if (isReferenceKind(input.kind) && !input.targetEntity) {
    return `field '${input.name}' of kind '${input.kind}' requires targetEntity`;
  }
  if (!isReferenceKind(input.kind) && input.targetEntity) {
    return `field '${input.name}' of kind '${input.kind}' must not declare targetEntity`;
  }

  if (input.kind === "aggregate") {
    if (!input.aggregate) return `aggregate field '${input.name}' requires an aggregate spec`;
    if (input.aggregate.fn !== "COUNT" && !input.aggregate.field) {
      return `aggregate field '${input.name}' requires aggregate.field for ${input.aggregate.fn}`;
    }
  } else if (input.aggregate) {
    return `field '${input.name}' of kind '${input.kind}' must not declare an aggregate spec`;
  }

  // formula/kpi/score are derived from an expression; aggregate derives from a
  // relationship walk instead, so it legitimately has no formula.
  const needsFormula = input.kind === "formula" || input.kind === "kpi" || input.kind === "score";
  if (needsFormula && (!input.formula || input.formula.trim() === "")) {
    return `field '${input.name}' of kind '${input.kind}' requires a formula`;
  }
  if (!needsFormula && input.formula) {
    return `field '${input.name}' of kind '${input.kind}' must not declare a formula`;
  }

  const v = input.validation;
  if (v) {
    if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
      return `field '${input.name}' has min greater than max`;
    }
    if (v.minLength !== undefined && v.maxLength !== undefined && v.minLength > v.maxLength) {
      return `field '${input.name}' has minLength greater than maxLength`;
    }
    if (v.activeOnly && !isReferenceKind(input.kind)) {
      return `field '${input.name}' declares activeOnly but is not a reference field`;
    }
  }

  return null;
}

/**
 * Registers a field descriptor, applying defaults.
 * Throws on an invalid descriptor — a malformed field would silently corrupt
 * every downstream engine, so it must fail at registration rather than at use.
 */
export function registerField(input: FieldMetadataInput): FieldMetadata {
  const error = validateFieldMetadata(input);
  if (error) throw new Error(`[IDXF/field-engine] ${error}`);

  const calculated = isCalculatedKind(input.kind);
  const field: FieldMetadata = {
    name: input.name,
    entity: input.entity,
    kind: input.kind,
    label: input.label ?? humanize(input.name),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.targetEntity !== undefined ? { targetEntity: input.targetEntity } : {}),
    searchable: input.searchable ?? false,
    related: input.related ?? isReferenceKind(input.kind),
    aiSuggestions: input.aiSuggestions ?? false,
    ...(input.formula !== undefined ? { formula: input.formula } : {}),
    ...(input.aggregate !== undefined ? { aggregate: input.aggregate } : {}),
    ...(input.defaultRule !== undefined ? { defaultRule: input.defaultRule } : {}),
    validation: input.validation ?? {},
    group: input.group ?? "General",
    order: input.order ?? 0,
    sensitive: input.sensitive ?? false,
    // Calculated fields are always read-only: writing one directly would be
    // overwritten by the next recalculation pass.
    readOnly: input.readOnly ?? calculated,
  };

  const entityFields = FIELDS.get(input.entity) ?? new Map<string, FieldMetadata>();
  entityFields.set(field.name, field);
  FIELDS.set(input.entity, entityFields);
  return field;
}

/** Registers many fields, rolling back nothing — validation happens per field. */
export function registerFields(inputs: FieldMetadataInput[]): FieldMetadata[] {
  return inputs.map(registerField);
}

export function getField(entity: string, name: string): FieldMetadata | undefined {
  return FIELDS.get(entity)?.get(name);
}

export function getEntityFields(entity: string): FieldMetadata[] {
  const map = FIELDS.get(entity);
  if (!map) return [];
  return Array.from(map.values()).sort(
    (a, b) => a.group.localeCompare(b.group) || a.order - b.order || a.name.localeCompare(b.name)
  );
}

export function getFieldsByKind(entity: string, kind: FieldKind): FieldMetadata[] {
  return getEntityFields(entity).filter((f) => f.kind === kind);
}

export function getSearchableFields(entity: string): FieldMetadata[] {
  return getEntityFields(entity).filter((f) => f.searchable);
}

export function getCalculatedFields(entity: string): FieldMetadata[] {
  return getEntityFields(entity).filter((f) => isCalculatedKind(f.kind));
}

export function getReferenceFields(entity: string): FieldMetadata[] {
  return getEntityFields(entity).filter((f) => isReferenceKind(f.kind));
}

export function getSensitiveFields(entity: string): FieldMetadata[] {
  return getEntityFields(entity).filter((f) => f.sensitive);
}

export function hasFields(entity: string): boolean {
  return (FIELDS.get(entity)?.size ?? 0) > 0;
}

export function getRegisteredEntities(): string[] {
  return Array.from(FIELDS.keys()).sort();
}

export function removeField(entity: string, name: string): boolean {
  const map = FIELDS.get(entity);
  if (!map) return false;
  return map.delete(name);
}

/** Field counts per entity — used by the metadata API and certification checks. */
export function getFieldStats(): {
  entities: number;
  fields: number;
  byKind: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  let fields = 0;
  for (const map of Array.from(FIELDS.values())) {
    for (const field of Array.from(map.values())) {
      fields += 1;
      byKind[field.kind] = (byKind[field.kind] ?? 0) + 1;
    }
  }
  return { entities: FIELDS.size, fields, byKind };
}
