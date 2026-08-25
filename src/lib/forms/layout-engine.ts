/**
 * IDXF Engine 82 — Layout Engine.
 *
 * Derives a responsive layout from field metadata alone. Fields declare a group
 * and an order; the engine arranges those groups into sections and adapts the
 * presentation per breakpoint — columns on desktop, accordion on tablet, cards
 * and tabs on phone.
 *
 * No page-specific layout code exists anywhere in the platform.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import {
  getEntityFields,
  isCalculatedKind,
  type FieldMetadata,
} from "@/lib/metadata/field-engine";
import { getEntity } from "@/lib/metadata/entity-registry";
import { getRelationshipsFrom } from "@/lib/metadata/relationship-registry";

export type Breakpoint = "desktop" | "tablet" | "phone";
export const BREAKPOINTS: Breakpoint[] = ["desktop", "tablet", "phone"];

export type SectionPresentation = "columns" | "accordion" | "cards" | "tabs";

export interface LayoutField {
  name: string;
  label: string;
  kind: string;
  required: boolean;
  readOnly: boolean;
  sensitive: boolean;
  /** Columns this field spans within its section. */
  span: number;
  order: number;
  targetEntity?: string;
  /** True when the value comes from the calculation engine. */
  derived: boolean;
}

export interface LayoutSection {
  key: string;
  label: string;
  order: number;
  fields: LayoutField[];
  /** Collapsed by default on smaller breakpoints. */
  collapsedByDefault: boolean;
}

export interface RelatedPanel {
  relationship: string;
  label: string;
  targetEntity: string;
  weight: number;
}

export interface FormLayout {
  entity: string;
  label: string;
  breakpoint: Breakpoint;
  presentation: SectionPresentation;
  columns: number;
  sections: LayoutSection[];
  relatedPanels: RelatedPanel[];
  /** Fields hidden because the caller's persona may not see them. */
  hiddenFields: string[];
  generatedAt: string;
}

/** Column counts per breakpoint. */
const COLUMNS: Record<Breakpoint, number> = { desktop: 2, tablet: 1, phone: 1 };

const PRESENTATION: Record<Breakpoint, SectionPresentation> = {
  desktop: "columns",
  tablet: "accordion",
  phone: "cards",
};

/**
 * Groups that lead the form regardless of alphabetical order.
 * A user reads identity before system metadata, so ordering is semantic rather
 * than incidental.
 */
const GROUP_PRIORITY: Record<string, number> = {
  General: 0,
  Contact: 10,
  Parties: 15,
  Location: 20,
  Scheduling: 30,
  Commercial: 35,
  Financial: 40,
  Billing: 45,
  Coverage: 50,
  Compliance: 55,
  Availability: 60,
  Feedback: 65,
  Insights: 70,
  AI: 80,
  Links: 85,
  System: 100,
};

function groupOrder(group: string): number {
  return GROUP_PRIORITY[group] ?? 75;
}

/** Wide field kinds occupy the full row rather than half of it. */
function fieldSpan(field: FieldMetadata, columns: number): number {
  if (columns === 1) return 1;
  const wide = ["ai_prompt", "ai_summary", "ai_recommendation", "address", "attachment", "video"];
  if (wide.includes(field.kind)) return columns;
  // Long free text needs the full width to be usable.
  if (field.kind === "text" && (field.validation.maxLength ?? 0) > 500) return columns;
  return 1;
}

export interface LayoutOptions {
  breakpoint?: Breakpoint;
  /**
   * Fields the caller's persona may see. When omitted every field is included —
   * callers enforcing RBAC must pass this explicitly.
   */
  visibleFields?: string[];
  /** Include groups that would otherwise be suppressed (e.g. System). */
  includeSystem?: boolean;
}

/** Builds the layout for an entity at a breakpoint. */
export function buildLayout(entity: string, options: LayoutOptions = {}): FormLayout {
  const definition = getEntity(entity);
  if (!definition) {
    throw new Error(`[IDXF/layout-engine] unknown entity: ${entity}`);
  }

  const breakpoint = options.breakpoint ?? "desktop";
  const columns = COLUMNS[breakpoint];
  const allowed = options.visibleFields ? new Set(options.visibleFields) : null;

  const hiddenFields: string[] = [];
  const byGroup = new Map<string, LayoutField[]>();

  for (const field of getEntityFields(entity)) {
    if (allowed && !allowed.has(field.name)) {
      hiddenFields.push(field.name);
      continue;
    }
    if (!options.includeSystem && field.group === "System") continue;

    const layoutField: LayoutField = {
      name: field.name,
      label: field.label,
      kind: field.kind,
      required: field.validation.required === true,
      readOnly: field.readOnly,
      sensitive: field.sensitive,
      span: fieldSpan(field, columns),
      order: field.order,
      ...(field.targetEntity !== undefined ? { targetEntity: field.targetEntity } : {}),
      derived: isCalculatedKind(field.kind),
    };

    const list = byGroup.get(field.group) ?? [];
    list.push(layoutField);
    byGroup.set(field.group, list);
  }

  const sections: LayoutSection[] = Array.from(byGroup.entries())
    .map(([key, fields]) => ({
      key,
      label: key,
      order: groupOrder(key),
      fields: fields.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
      // On desktop everything is visible at once; on smaller screens only the
      // leading section stays open so the form is navigable.
      collapsedByDefault: breakpoint !== "desktop" && groupOrder(key) > 0,
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  const relatedPanels: RelatedPanel[] = getRelationshipsFrom(entity)
    .filter((r) => r.surfaceInWorkspace)
    .map((r) => ({
      relationship: r.name,
      label: r.label,
      targetEntity: r.to,
      weight: r.weight,
    }));

  return {
    entity,
    label: definition.label,
    breakpoint,
    presentation: PRESENTATION[breakpoint],
    columns,
    sections,
    relatedPanels,
    hiddenFields,
    generatedAt: new Date().toISOString(),
  };
}

/** Layouts for every breakpoint, for clients that render responsively. */
export function buildResponsiveLayouts(
  entity: string,
  options: Omit<LayoutOptions, "breakpoint"> = {}
): Record<Breakpoint, FormLayout> {
  return {
    desktop: buildLayout(entity, { ...options, breakpoint: "desktop" }),
    tablet: buildLayout(entity, { ...options, breakpoint: "tablet" }),
    phone: buildLayout(entity, { ...options, breakpoint: "phone" }),
  };
}
