/**
 * IDXF Engine 81 — Entity Registry.
 *
 * Declares every business object the runtime knows about. An entity definition
 * plus its field metadata is enough for the platform to generate lookups,
 * related-record views, forms, validation and a workspace — no per-module code.
 *
 * Entity definitions describe shape, not rows, so this registry is process-global
 * and carries no tenant dimension. Tenant isolation is enforced when rows are
 * read or written, using `tenantScoped` below to decide whether a tenant filter
 * is mandatory.
 */

import { getEntityFields, registerFields, type FieldMetadataInput } from "./field-engine";

export type EntityDomain =
  | "crm"
  | "operations"
  | "finance"
  | "workforce"
  | "franchise"
  | "compliance"
  | "inventory"
  | "ai"
  | "platform";

export interface EntityDefinition {
  /** Machine key, e.g. "customer". */
  key: string;
  label: string;
  /** Plural label used in list and related views. */
  labelPlural: string;
  domain: EntityDomain;
  /** Backing table name where rows live. */
  table: string;
  /** Field holding the row's primary key. */
  primaryKeyField: string;
  /** Field used as the human-readable title in lookups and related cards. */
  displayField: string;
  /**
   * Whether rows carry a tenant_id. Every business entity must; only genuinely
   * global platform metadata may opt out.
   */
  tenantScoped: boolean;
  /** Field holding lifecycle status, when the entity has one. */
  statusField?: string;
  /** Status values considered "active" for activeOnly lookups. */
  activeStatuses: string[];
  /** Workspace tabs this entity supports beyond the universal set. */
  extraWorkspaceTabs: string[];
  registeredAt: string;
}

export interface EntityDefinitionInput {
  key: string;
  label: string;
  labelPlural?: string;
  domain: EntityDomain;
  table: string;
  primaryKeyField?: string;
  displayField: string;
  tenantScoped?: boolean;
  statusField?: string;
  activeStatuses?: string[];
  extraWorkspaceTabs?: string[];
  /** Fields registered alongside the entity, for a single declarative call. */
  fields?: Omit<FieldMetadataInput, "entity">[];
}

const ENTITIES: Map<string, EntityDefinition> = new Map();

export function registerEntity(input: EntityDefinitionInput): EntityDefinition {
  if (!input.key || input.key.trim() === "") {
    throw new Error("[IDXF/entity-registry] entity key is required");
  }
  if (!input.table || input.table.trim() === "") {
    throw new Error(`[IDXF/entity-registry] entity '${input.key}' requires a table`);
  }
  if (!input.displayField || input.displayField.trim() === "") {
    throw new Error(`[IDXF/entity-registry] entity '${input.key}' requires a displayField`);
  }
  // A status field without active values would make every activeOnly lookup
  // return nothing, which reads as "no matches" rather than a misconfiguration.
  if (input.statusField && (!input.activeStatuses || input.activeStatuses.length === 0)) {
    throw new Error(
      `[IDXF/entity-registry] entity '${input.key}' declares statusField but no activeStatuses`
    );
  }

  const definition: EntityDefinition = {
    key: input.key,
    label: input.label,
    labelPlural: input.labelPlural ?? `${input.label}s`,
    domain: input.domain,
    table: input.table,
    primaryKeyField: input.primaryKeyField ?? "id",
    displayField: input.displayField,
    tenantScoped: input.tenantScoped ?? true,
    ...(input.statusField !== undefined ? { statusField: input.statusField } : {}),
    activeStatuses: input.activeStatuses ?? [],
    extraWorkspaceTabs: input.extraWorkspaceTabs ?? [],
    registeredAt: new Date().toISOString(),
  };

  ENTITIES.set(definition.key, definition);

  if (input.fields && input.fields.length > 0) {
    registerFields(input.fields.map((f) => ({ ...f, entity: definition.key })));
  }

  return definition;
}

export function getEntity(key: string): EntityDefinition | undefined {
  return ENTITIES.get(key);
}

export function requireEntity(key: string): EntityDefinition {
  const entity = ENTITIES.get(key);
  if (!entity) throw new Error(`[IDXF/entity-registry] unknown entity: ${key}`);
  return entity;
}

export function getAllEntities(): EntityDefinition[] {
  return Array.from(ENTITIES.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function getEntitiesByDomain(domain: EntityDomain): EntityDefinition[] {
  return getAllEntities().filter((e) => e.domain === domain);
}

export function entityExists(key: string): boolean {
  return ENTITIES.has(key);
}

/** Entity plus its resolved field set — the unit the form and workspace runtimes consume. */
export function describeEntity(key: string): {
  entity: EntityDefinition;
  fields: ReturnType<typeof getEntityFields>;
} | undefined {
  const entity = ENTITIES.get(key);
  if (!entity) return undefined;
  return { entity, fields: getEntityFields(key) };
}

export function getEntityStats(): {
  total: number;
  byDomain: Record<string, number>;
  tenantScoped: number;
} {
  const byDomain: Record<string, number> = {};
  let tenantScoped = 0;
  for (const entity of Array.from(ENTITIES.values())) {
    byDomain[entity.domain] = (byDomain[entity.domain] ?? 0) + 1;
    if (entity.tenantScoped) tenantScoped += 1;
  }
  return { total: ENTITIES.size, byDomain, tenantScoped };
}
