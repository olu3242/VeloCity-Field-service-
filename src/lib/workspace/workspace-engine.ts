/**
 * IDXF Engine 90 — Universal Data Workspace.
 *
 * Every entity receives the same enterprise workspace — overview, details,
 * related, timeline, documents, AI, automation, audit, analytics, knowledge
 * graph, permissions, API, health, versions — assembled from metadata.
 *
 * The workspace composes the other engines rather than reimplementing anything:
 * layout from Engine 82, related sections from 76, quality from 87, assistance
 * from 89, versions from the schema registry.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import { getEntity, type EntityDefinition } from "@/lib/metadata/entity-registry";
import { getEntityFields, isCalculatedKind } from "@/lib/metadata/field-engine";
import { getRelationshipsFrom } from "@/lib/metadata/relationship-registry";
import { getSchemaHistory, getCurrentSchema } from "@/lib/metadata/schema-registry";
import { buildLayout, type Breakpoint, type FormLayout } from "@/lib/forms/layout-engine";
import { describeFormRules } from "@/lib/forms/dynamic-form-engine";
import {
  getRelated,
  describeRelatedSurface,
  type RelatedResult,
  type GetRelatedOptions,
} from "@/lib/related/related-engine";
import { buildEgoGraph, type EgoGraph } from "@/lib/related/relationship-graph";
import { scoreQuality, type QualityReport, type QualityOptions } from "@/lib/quality/quality-engine";
import { checkCalculationHealth } from "@/lib/calculation/calculation-runtime";
import { generateSummary, suggestAutomation } from "@/lib/ai/field-assistant";
import { validateRecord, type ValidationResult } from "@/lib/validation/validation-engine";

export type WorkspaceTab =
  | "Overview"
  | "Details"
  | "Related"
  | "Timeline"
  | "Documents"
  | "AI"
  | "Automation"
  | "Audit"
  | "Analytics"
  | "Knowledge Graph"
  | "Permissions"
  | "API"
  | "Health"
  | "Versions";

/** The universal tab set every entity receives. */
export const UNIVERSAL_TABS: WorkspaceTab[] = [
  "Overview",
  "Details",
  "Related",
  "Timeline",
  "Documents",
  "AI",
  "Automation",
  "Audit",
  "Analytics",
  "Knowledge Graph",
  "Permissions",
  "API",
  "Health",
  "Versions",
];

export interface WorkspaceTabDescriptor {
  key: string;
  label: string;
  /** Count badge, when the tab has a meaningful one. */
  badge?: number;
  /** False when the tab has nothing to show for this record. */
  available: boolean;
  /** Why the tab is unavailable, when it is. */
  unavailableReason?: string;
}

export interface ApiSurface {
  entity: string;
  basePath: string;
  operations: Array<{ method: string; path: string; description: string }>;
}

export interface WorkspaceHealth {
  calculationHealthy: boolean;
  calculationIssues: string[];
  schemaVersioned: boolean;
  schemaVersion: number | null;
  validationPasses: boolean;
  qualityScore: number | null;
  qualityGrade: string | null;
}

export interface Workspace {
  entity: string;
  label: string;
  recordId: string | null;
  title: string;
  tabs: WorkspaceTabDescriptor[];
  overview: {
    summary: string;
    highlights: Array<{ label: string; value: string }>;
    status?: string;
  };
  layout: FormLayout;
  related?: RelatedResult;
  knowledgeGraph: EgoGraph;
  automation: ReturnType<typeof suggestAutomation>;
  quality?: QualityReport;
  validation?: ValidationResult;
  health: WorkspaceHealth;
  versions: {
    current: number | null;
    history: Array<{ version: number; checksum: string; capturedAt: string; fieldCount: number }>;
  };
  api: ApiSurface;
  permissions: {
    /** Fields the caller may see, as resolved by the caller's RBAC layer. */
    visibleFields: string[];
    hiddenFields: string[];
    sensitiveFields: string[];
  };
  generatedAt: string;
}

export interface WorkspaceOptions {
  breakpoint?: Breakpoint;
  /**
   * Fields the caller's persona may see. Resolved by the caller against
   * access/checkFieldPermission — the workspace does not decide visibility.
   */
  visibleFields?: string[];
  /** Enables the Related tab's row loading. */
  relatedOptions?: GetRelatedOptions;
  /** Enables the quality report. */
  qualityOptions?: QualityOptions;
  includeValidation?: boolean;
  graphDepth?: number;
}

function buildApiSurface(entity: string, definition: EntityDefinition): ApiSurface {
  const basePath = `/api/idxf/${entity}`;
  return {
    entity,
    basePath,
    operations: [
      { method: "GET", path: `${basePath}`, description: `List ${definition.labelPlural.toLowerCase()} for the tenant` },
      { method: "GET", path: `${basePath}/{id}`, description: `Read one ${definition.label.toLowerCase()}` },
      { method: "POST", path: `${basePath}`, description: `Create a ${definition.label.toLowerCase()} through the runtime pipeline` },
      { method: "PATCH", path: `${basePath}/{id}`, description: `Update, recalculating and revalidating` },
      { method: "GET", path: `${basePath}/{id}/related`, description: "Related records across every relationship" },
      { method: "GET", path: `${basePath}/{id}/workspace`, description: "Full workspace payload" },
      { method: "POST", path: `${basePath}/lookup`, description: "Ranked lookup against this entity" },
    ],
  };
}

function buildTabs(
  entity: string,
  definition: EntityDefinition,
  options: WorkspaceOptions,
  related: RelatedResult | undefined,
  versionCount: number
): WorkspaceTabDescriptor[] {
  const fields = getEntityFields(entity);
  const relationships = getRelationshipsFrom(entity).filter((r) => r.surfaceInWorkspace);
  const hasDocuments = fields.some((f) =>
    ["attachment", "image", "video", "signature"].includes(f.kind)
  );
  const hasTimeline = fields.some((f) => f.kind === "date") || definition.statusField !== undefined;

  const tabs: WorkspaceTabDescriptor[] = UNIVERSAL_TABS.map((label) => {
    switch (label) {
      case "Related":
        return {
          key: "related",
          label,
          badge: related?.totalRelated ?? relationships.length,
          available: relationships.length > 0,
          ...(relationships.length === 0
            ? { unavailableReason: "No relationships are declared for this entity." }
            : {}),
        };
      case "Documents":
        return {
          key: "documents",
          label,
          available: hasDocuments,
          ...(hasDocuments ? {} : { unavailableReason: "Entity declares no media fields." }),
        };
      case "Timeline":
        return {
          key: "timeline",
          label,
          available: hasTimeline,
          ...(hasTimeline ? {} : { unavailableReason: "Entity declares no date or status fields." }),
        };
      case "Versions":
        return {
          key: "versions",
          label,
          badge: versionCount,
          available: versionCount > 0,
          ...(versionCount === 0 ? { unavailableReason: "Schema has not been versioned yet." } : {}),
        };
      case "Knowledge Graph":
        return {
          key: "knowledge_graph",
          label,
          available: relationships.length > 0,
          ...(relationships.length === 0
            ? { unavailableReason: "Entity has no edges to graph." }
            : {}),
        };
      default:
        return { key: label.toLowerCase().replace(/\s+/g, "_"), label, available: true };
    }
  });

  // Entity-specific extras declared in metadata append after the universal set.
  for (const extra of definition.extraWorkspaceTabs) {
    tabs.push({ key: extra.toLowerCase().replace(/\s+/g, "_"), label: extra as WorkspaceTab, available: true });
  }

  return tabs;
}

/** Assembles the complete workspace for one record. */
export function buildWorkspace(
  entity: string,
  record: Record<string, unknown>,
  options: WorkspaceOptions = {}
): Workspace {
  const definition = getEntity(entity);
  if (!definition) {
    throw new Error(`[IDXF/workspace-engine] unknown entity: ${entity}`);
  }

  const idRaw = record[definition.primaryKeyField];
  const recordId = typeof idRaw === "string" ? idRaw : null;

  const layout = buildLayout(entity, {
    ...(options.breakpoint ? { breakpoint: options.breakpoint } : {}),
    ...(options.visibleFields ? { visibleFields: options.visibleFields } : {}),
  });

  const related = options.relatedOptions && recordId
    ? getRelated(entity, recordId, options.relatedOptions)
    : undefined;

  const summary = generateSummary(entity, record);
  const history = getSchemaHistory(entity);
  const current = getCurrentSchema(entity);

  const calcHealth = checkCalculationHealth(entity);
  const validation = options.includeValidation
    ? validateRecord(entity, record, { stage: "before_save" })
    : undefined;
  const quality = options.qualityOptions
    ? scoreQuality(entity, record, options.qualityOptions)
    : undefined;

  const allFields = getEntityFields(entity).map((f) => f.name);
  const visibleFields = options.visibleFields ?? allFields;

  const statusRaw = definition.statusField ? record[definition.statusField] : undefined;
  const titleRaw = record[definition.displayField];

  return {
    entity,
    label: definition.label,
    recordId,
    title: typeof titleRaw === "string" && titleRaw !== "" ? titleRaw : (recordId ?? definition.label),
    tabs: buildTabs(entity, definition, options, related, history.length),
    overview: {
      summary: summary.summary,
      highlights: summary.highlights,
      ...(typeof statusRaw === "string" ? { status: statusRaw } : {}),
    },
    layout,
    ...(related ? { related } : {}),
    knowledgeGraph: buildEgoGraph(entity, options.graphDepth ?? 2),
    automation: suggestAutomation(entity, record),
    ...(quality ? { quality } : {}),
    ...(validation ? { validation } : {}),
    health: {
      calculationHealthy: calcHealth.healthy,
      calculationIssues: [
        ...calcHealth.cycles.map((c) => `Circular dependency: ${c.join(" → ")}`),
        ...calcHealth.invalidFormulas.map((f) => `Invalid formula on ${f.field}: ${f.error}`),
        ...calcHealth.unknownReferences.map((r) => `${r.field} references unknown field '${r.reference}'`),
      ],
      schemaVersioned: current !== undefined,
      schemaVersion: current?.version ?? null,
      validationPasses: validation?.valid ?? true,
      qualityScore: quality?.score ?? null,
      qualityGrade: quality?.grade ?? null,
    },
    versions: {
      current: current?.version ?? null,
      history: history.map((s) => ({
        version: s.version,
        checksum: s.checksum,
        capturedAt: s.capturedAt,
        fieldCount: s.fieldCount,
      })),
    },
    api: buildApiSurface(entity, definition),
    permissions: {
      visibleFields,
      hiddenFields: allFields.filter((f) => !visibleFields.includes(f)),
      sensitiveFields: getEntityFields(entity).filter((f) => f.sensitive).map((f) => f.name),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Entity-level workspace capability report — what the runtime provides for an
 * entity, independent of any record.
 */
export function describeWorkspace(entity: string): {
  entity: string;
  label: string;
  tabs: WorkspaceTab[];
  extraTabs: string[];
  fieldCount: number;
  calculatedFieldCount: number;
  relationshipCount: number;
  formRuleCount: number;
  relatedSurface: ReturnType<typeof describeRelatedSurface>;
} | null {
  const definition = getEntity(entity);
  if (!definition) return null;

  const fields = getEntityFields(entity);
  return {
    entity,
    label: definition.label,
    tabs: UNIVERSAL_TABS,
    extraTabs: definition.extraWorkspaceTabs,
    fieldCount: fields.length,
    calculatedFieldCount: fields.filter((f) => isCalculatedKind(f.kind)).length,
    relationshipCount: getRelationshipsFrom(entity).length,
    formRuleCount: describeFormRules(entity).length,
    relatedSurface: describeRelatedSurface(entity),
  };
}
