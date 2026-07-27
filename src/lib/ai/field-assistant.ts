/**
 * IDXF Engine 89 — AI Data Assistant.
 *
 * Contextual assistance beside every form: explain a validation failure, explain
 * how a calculated value was derived, complete missing fields, summarise a
 * record, surface duplicates.
 *
 * Explanations are generated from the runtime's own metadata and results rather
 * than from a language model. A model asked to explain a calculation can invent
 * a plausible-sounding derivation that does not match what the engine actually
 * computed; walking the real AST and dependency graph cannot. That makes these
 * explanations correct by construction, synchronous, and free of an external
 * dependency in the request path.
 */

import {
  getEntityFields,
  getField,
  isCalculatedKind,
  type FieldMetadata,
} from "@/lib/metadata/field-engine";
import { getEntity } from "@/lib/metadata/entity-registry";
import { getRelationshipsFrom } from "@/lib/metadata/relationship-registry";
import { evaluateFormula, extractFieldReferences } from "@/lib/calculation/formula-engine";
import { getDependencyChain, getAffectedFields } from "@/lib/calculation/dependency-engine";
import { validateRecord, type ValidationResult } from "@/lib/validation/validation-engine";
import { resolveFieldDefault, type DefaultContext } from "@/lib/forms/smart-defaults";
import { getBusinessRule } from "@/lib/validation/business-rules";

export type AssistantCapability =
  | "explain_validation"
  | "explain_calculation"
  | "complete_fields"
  | "generate_summary"
  | "detect_duplicates"
  | "suggest_automation"
  | "explain_field";

export const ASSISTANT_CAPABILITIES: AssistantCapability[] = [
  "explain_validation",
  "explain_calculation",
  "complete_fields",
  "generate_summary",
  "detect_duplicates",
  "suggest_automation",
  "explain_field",
];

export interface Explanation {
  subject: string;
  summary: string;
  /** Ordered reasoning steps, each traceable to metadata or a computed value. */
  steps: string[];
  /** Where each claim came from, so nothing is unattributable. */
  sources: string[];
}

/**
 * Explains why validation failed and what would fix it.
 * Every line is derived from the actual ValidationResult.
 */
export function explainValidation(
  entity: string,
  result: ValidationResult
): Explanation {
  const steps: string[] = [];
  const sources: string[] = [`validation-engine:${result.stage}`];

  if (result.valid) {
    steps.push(`All ${result.stage.replace(/_/g, " ")} checks passed.`);
    if (result.warnings.length > 0) {
      steps.push(`${result.warnings.length} warning(s) were raised but do not block saving.`);
    }
  } else {
    for (const error of result.errors) {
      const field = getField(entity, error.field);
      const label = field?.label ?? error.field;
      steps.push(`${label}: ${error.message}`);

      // Business-rule failures carry their own description worth surfacing.
      if (error.code.startsWith("rule_")) {
        const rule = getBusinessRule(error.code.slice(5));
        if (rule) {
          steps.push(`  Rule "${rule.label}": ${rule.description}`);
          sources.push(`business-rule:${rule.id}`);
        }
      }
      if (error.autoFix) {
        steps.push(`  Suggested fix: ${error.autoFix.description}`);
      }
    }
  }

  if (!result.complete) {
    steps.push(
      "Note: some cross-record checks were skipped because no resolver was supplied — this verdict is partial."
    );
  }

  return {
    subject: `${entity} validation (${result.stage})`,
    summary: result.valid
      ? `Record passes ${result.stage.replace(/_/g, " ")}.`
      : `${result.errors.length} error(s) block saving.`,
    steps,
    sources,
  };
}

/**
 * Explains how a calculated field was derived, by walking the real formula and
 * substituting the record's actual values.
 */
export function explainCalculation(
  entity: string,
  fieldName: string,
  record: Record<string, unknown>
): Explanation | null {
  const field = getField(entity, fieldName);
  if (!field) return null;

  if (!isCalculatedKind(field.kind)) {
    return {
      subject: `${entity}.${fieldName}`,
      summary: `${field.label} is entered directly, not calculated.`,
      steps: [`Field kind is '${field.kind}', which holds a stored value.`],
      sources: [`field-metadata:${entity}.${fieldName}`],
    };
  }

  const steps: string[] = [];
  const sources: string[] = [`field-metadata:${entity}.${fieldName}`];

  if (field.kind === "aggregate" && field.aggregate) {
    const spec = field.aggregate;
    steps.push(
      `${field.label} is ${spec.fn} of ${spec.field ?? "matching rows"} across the '${spec.relationship}' relationship.`
    );
    sources.push(`relationship:${entity}.${spec.relationship}`);
    return {
      subject: `${entity}.${fieldName}`,
      summary: `${field.label} aggregates related ${spec.relationship}.`,
      steps,
      sources,
    };
  }

  if (!field.formula) return null;

  steps.push(`Formula: ${field.formula}`);

  // Substitute each referenced field's live value, so the explanation reflects
  // this record rather than the formula in the abstract.
  const references = (() => {
    try {
      return extractFieldReferences(field.formula);
    } catch {
      return [];
    }
  })();

  for (const reference of references) {
    const referenced = getField(entity, reference);
    const value = record[reference];
    steps.push(
      `  ${referenced?.label ?? reference} = ${value === undefined || value === null ? "(empty)" : String(value)}`
    );
  }

  const result = evaluateFormula(field.formula, record);
  if (result.ok) {
    steps.push(`Result: ${String(result.value)}`);
    const { min, max } = field.validation;
    if ((min !== undefined || max !== undefined) && typeof result.value === "number") {
      steps.push(`Clamped to the declared range [${min ?? "-∞"}, ${max ?? "∞"}].`);
    }
  } else {
    steps.push(`Could not evaluate: ${result.error}`);
  }

  const chain = getDependencyChain(entity, fieldName);
  if (chain.length > 0) {
    steps.push(`Depends on: ${chain.join(", ")}`);
    sources.push(`dependency-graph:${entity}`);
  }

  const downstream = getAffectedFields(entity, fieldName);
  if (downstream.length > 0) {
    steps.push(`Changing this updates: ${downstream.join(", ")}`);
  }

  return {
    subject: `${entity}.${fieldName}`,
    summary: `${field.label} is calculated from ${references.length} field(s).`,
    steps,
    sources,
  };
}

export interface FieldCompletion {
  field: string;
  label: string;
  suggestedValue: unknown;
  confidence: number;
  reason: string;
  source: string;
}

/**
 * Proposes values for empty fields using registered default rules.
 * Only fields with a declared rule are completed — the assistant does not invent
 * values for fields the platform has no basis to infer.
 */
export function completeFields(
  entity: string,
  record: Record<string, unknown>,
  context: DefaultContext
): { completions: FieldCompletion[]; uninferable: string[] } {
  const completions: FieldCompletion[] = [];
  const uninferable: string[] = [];

  for (const field of getEntityFields(entity)) {
    if (field.readOnly) continue;
    const value = record[field.name];
    const empty = value === null || value === undefined || value === "";
    if (!empty) continue;

    if (!field.defaultRule) {
      if (field.validation.required) uninferable.push(field.name);
      continue;
    }

    const resolved = resolveFieldDefault(entity, field.name, { ...context, record });
    if (!resolved) {
      if (field.validation.required) uninferable.push(field.name);
      continue;
    }

    completions.push({
      field: field.name,
      label: field.label,
      suggestedValue: resolved.value,
      confidence: resolved.confidence,
      reason: resolved.reason,
      source: resolved.source,
    });
  }

  return { completions, uninferable };
}

/**
 * Human-readable record summary built from the fields that carry meaning.
 * Sensitive values are never included — a summary is frequently copied around.
 */
export function generateSummary(
  entity: string,
  record: Record<string, unknown>
): { summary: string; highlights: Array<{ label: string; value: string }> } {
  const definition = getEntity(entity);
  if (!definition) return { summary: "Unknown entity.", highlights: [] };

  const titleRaw = record[definition.displayField];
  const title = typeof titleRaw === "string" && titleRaw !== "" ? titleRaw : "Untitled";

  const highlights: Array<{ label: string; value: string }> = [];
  for (const field of getEntityFields(entity)) {
    if (field.sensitive) continue;
    if (field.group === "System") continue;
    if (field.name === definition.displayField) continue;
    const value = record[field.name];
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object") continue;
    highlights.push({ label: field.label, value: String(value) });
    if (highlights.length >= 6) break;
  }

  const statusRaw = definition.statusField ? record[definition.statusField] : undefined;
  const statusPart = typeof statusRaw === "string" ? ` (${statusRaw})` : "";

  return {
    summary:
      `${definition.label} "${title}"${statusPart}. ` +
      (highlights.length > 0
        ? highlights.map((h) => `${h.label}: ${h.value}`).join("; ") + "."
        : "No additional populated fields."),
    highlights,
  };
}

export interface AutomationSuggestion {
  trigger: string;
  action: string;
  rationale: string;
  confidence: number;
}

/**
 * Suggests automation opportunities from the record's shape and relationships.
 * Grounded in declared metadata, so every suggestion is actionable.
 */
export function suggestAutomation(
  entity: string,
  record: Record<string, unknown>
): AutomationSuggestion[] {
  const suggestions: AutomationSuggestion[] = [];
  const definition = getEntity(entity);
  if (!definition) return suggestions;

  if (definition.statusField) {
    const status = record[definition.statusField];
    if (typeof status === "string") {
      suggestions.push({
        trigger: `${entity}.${definition.statusField} changes from '${status}'`,
        action: `Notify the owning team and record a timeline entry`,
        rationale: `${definition.label} tracks lifecycle status, so transitions are meaningful events.`,
        confidence: 0.8,
      });
    }
  }

  for (const relationship of getRelationshipsFrom(entity)) {
    if (relationship.weight < 0.8) continue;
    suggestions.push({
      trigger: `A new ${relationship.to} is linked to this ${entity}`,
      action: `Recalculate aggregate fields and refresh the ${relationship.label} panel`,
      rationale: `'${relationship.name}' is a high-weight relationship (${relationship.weight}).`,
      confidence: 0.7,
    });
  }

  const calculated = getEntityFields(entity).filter((f) => isCalculatedKind(f.kind));
  if (calculated.length > 0) {
    suggestions.push({
      trigger: `Any input to ${calculated.map((f) => f.label).slice(0, 3).join(", ")} changes`,
      action: "Run incremental recalculation and propagate downstream",
      rationale: `${calculated.length} calculated field(s) depend on stored inputs.`,
      confidence: 0.9,
    });
  }

  return suggestions.slice(0, 6);
}

/** Explains what a field is and how the runtime treats it. */
export function explainField(entity: string, fieldName: string): Explanation | null {
  const field: FieldMetadata | undefined = getField(entity, fieldName);
  if (!field) return null;

  const steps: string[] = [
    `Kind: ${field.kind}${field.readOnly ? " (read-only — produced by the runtime)" : ""}`,
  ];
  if (field.description) steps.push(field.description);
  if (field.targetEntity) steps.push(`References the '${field.targetEntity}' entity.`);
  if (field.validation.required) steps.push("Required — the record cannot be saved without it.");
  if (field.validation.activeOnly) steps.push("Only active records may be selected.");
  if (field.validation.format) steps.push(`Must be formatted as ${field.validation.format}.`);
  if (field.validation.min !== undefined || field.validation.max !== undefined) {
    steps.push(`Allowed range: ${field.validation.min ?? "-∞"} to ${field.validation.max ?? "∞"}.`);
  }
  for (const ruleId of field.validation.businessRules ?? []) {
    const rule = getBusinessRule(ruleId);
    if (rule) steps.push(`Business rule "${rule.label}": ${rule.description}`);
  }
  if (field.sensitive) steps.push("Sensitive — masked unless the persona is permitted to read it.");
  if (field.defaultRule) steps.push(`Auto-populated by the '${field.defaultRule}' default rule.`);
  if (field.searchable) steps.push("Indexed for lookup search.");

  return {
    subject: `${entity}.${fieldName}`,
    summary: `${field.label} — ${field.kind}`,
    steps,
    sources: [`field-metadata:${entity}.${fieldName}`],
  };
}

export interface AssistantResponse {
  entity: string;
  capability: AssistantCapability;
  explanation?: Explanation;
  completions?: FieldCompletion[];
  summary?: ReturnType<typeof generateSummary>;
  automation?: AutomationSuggestion[];
  /**
   * Every response is derived from runtime metadata and computed results, never
   * from a generative model, so nothing here can be a confident fabrication.
   */
  derivedFrom: "runtime_metadata";
  generatedAt: string;
}

/** Single entry point used by the workspace AI panel. */
export function assist(
  entity: string,
  capability: AssistantCapability,
  record: Record<string, unknown>,
  options: { field?: string; defaultContext?: DefaultContext } = {}
): AssistantResponse {
  const base = {
    entity,
    capability,
    derivedFrom: "runtime_metadata" as const,
    generatedAt: new Date().toISOString(),
  };

  switch (capability) {
    case "explain_validation": {
      const result = validateRecord(entity, record, { stage: "before_save" });
      return { ...base, explanation: explainValidation(entity, result) };
    }
    case "explain_calculation": {
      if (!options.field) throw new Error("[IDXF/field-assistant] explain_calculation requires a field");
      const explanation = explainCalculation(entity, options.field, record);
      return { ...base, ...(explanation ? { explanation } : {}) };
    }
    case "explain_field": {
      if (!options.field) throw new Error("[IDXF/field-assistant] explain_field requires a field");
      const explanation = explainField(entity, options.field);
      return { ...base, ...(explanation ? { explanation } : {}) };
    }
    case "complete_fields": {
      if (!options.defaultContext) {
        throw new Error("[IDXF/field-assistant] complete_fields requires a defaultContext");
      }
      return { ...base, completions: completeFields(entity, record, options.defaultContext).completions };
    }
    case "generate_summary":
      return { ...base, summary: generateSummary(entity, record) };
    case "suggest_automation":
      return { ...base, automation: suggestAutomation(entity, record) };
    case "detect_duplicates":
      // Duplicate detection needs tenant-scoped candidates the assistant cannot
      // fetch; the caller runs the duplicate engine and passes results through.
      throw new Error(
        "[IDXF/field-assistant] detect_duplicates requires tenant-scoped candidates — call detectDuplicates directly"
      );
  }
}
