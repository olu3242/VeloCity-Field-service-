/**
 * IDXF Engines 82 & 83 — Smart Form Runtime + Dynamic Form Rules.
 *
 * Assembles a complete, ready-to-render form from metadata: layout, per-field
 * state (visible / enabled / required), lookup configuration, defaults, live
 * calculations and validation — with no page-specific form code.
 *
 * Form rules are declarative: a condition (Engine 84) drives an effect on a set
 * of fields. Rules are data, so they are authored and audited rather than coded.
 */

import { getEntityFields, getField, type FieldMetadata } from "@/lib/metadata/field-engine";
import { getEntity } from "@/lib/metadata/entity-registry";
import {
  evaluateCondition,
  extractConditionFields,
  describeCondition,
  validateCondition,
  type ConditionNode,
} from "./conditional-engine";
import { buildLayout, type FormLayout, type LayoutOptions } from "./layout-engine";
import { resolveDefaults, type DefaultContext, type DefaultResolution } from "./smart-defaults";
import { calculate, type AggregateResolver } from "@/lib/calculation/calculation-runtime";
import { validateRecord, type ValidationResult, type ValidationStage } from "@/lib/validation/validation-engine";

export type FormEffect =
  | "show"
  | "hide"
  | "enable"
  | "disable"
  | "require"
  | "optional";

export const FORM_EFFECTS: FormEffect[] = [
  "show", "hide", "enable", "disable", "require", "optional",
];

export interface FormRule {
  id: string;
  entity: string;
  label: string;
  condition: ConditionNode;
  effect: FormEffect;
  /** Fields the effect applies to. */
  targets: string[];
  /** Lower runs first; later rules win on conflict. */
  priority: number;
  enabled: boolean;
}

const RULES: Map<string, FormRule[]> = new Map();

export function registerFormRule(rule: Omit<FormRule, "enabled"> & { enabled?: boolean }): FormRule {
  const entityFields = getEntityFields(rule.entity).map((f) => f.name);
  const validation = validateCondition(rule.condition, entityFields);
  if (!validation.valid) {
    // A malformed condition evaluates false and silently disables the rule it
    // guards, so it is rejected at registration.
    throw new Error(
      `[IDXF/dynamic-form-engine] rule '${rule.id}' has an invalid condition: ${validation.errors.join("; ")}`
    );
  }

  const unknownTargets = rule.targets.filter((t) => !entityFields.includes(t));
  if (unknownTargets.length > 0) {
    throw new Error(
      `[IDXF/dynamic-form-engine] rule '${rule.id}' targets unknown field(s): ${unknownTargets.join(", ")}`
    );
  }

  const full: FormRule = { ...rule, enabled: rule.enabled ?? true };
  const list = RULES.get(rule.entity) ?? [];
  const existing = list.findIndex((r) => r.id === rule.id);
  if (existing >= 0) list[existing] = full;
  else list.push(full);
  RULES.set(rule.entity, list);
  return full;
}

export function getFormRules(entity: string): FormRule[] {
  return [...(RULES.get(entity) ?? [])].sort((a, b) => a.priority - b.priority);
}

export function removeFormRule(entity: string, id: string): boolean {
  const list = RULES.get(entity);
  if (!list) return false;
  const index = list.findIndex((r) => r.id === id);
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
}

export interface FieldState {
  name: string;
  visible: boolean;
  enabled: boolean;
  required: boolean;
  /** Rules that changed this field's state, in application order. */
  appliedRules: Array<{ id: string; effect: FormEffect }>;
}

export interface LookupConfig {
  field: string;
  targetEntity: string;
  activeOnly: boolean;
  aiSuggestions: boolean;
}

export interface FormState {
  entity: string;
  layout: FormLayout;
  fieldStates: Record<string, FieldState>;
  lookups: LookupConfig[];
  defaults: DefaultResolution[];
  /** Record after defaults and calculations were applied. */
  record: Record<string, unknown>;
  validation?: ValidationResult;
  /** Rule ids evaluated and whether each matched. */
  ruleTrace: Array<{ id: string; label: string; matched: boolean; description: string }>;
  generatedAt: string;
}

export interface BuildFormOptions extends LayoutOptions {
  /** Applies smart defaults for empty fields. */
  defaultContext?: DefaultContext;
  /** Runs calculations after defaults. */
  aggregateResolver?: AggregateResolver;
  /** Runs validation and includes the result. */
  validate?: boolean;
  validationStage?: ValidationStage;
  now?: Date;
}

/**
 * Applies form rules to derive per-field state.
 *
 * Rules run in priority order and later rules override earlier ones, so a
 * specific rule can be layered on top of a general one deterministically.
 */
function applyRules(
  entity: string,
  record: Record<string, unknown>,
  fields: FieldMetadata[]
): { states: Record<string, FieldState>; trace: FormState["ruleTrace"] } {
  const states: Record<string, FieldState> = {};
  for (const field of fields) {
    states[field.name] = {
      name: field.name,
      visible: true,
      // A calculated field is never directly editable.
      enabled: !field.readOnly,
      required: field.validation.required === true,
      appliedRules: [],
    };
  }

  const trace: FormState["ruleTrace"] = [];

  for (const rule of getFormRules(entity)) {
    if (!rule.enabled) continue;
    const result = evaluateCondition(rule.condition, record);
    trace.push({
      id: rule.id,
      label: rule.label,
      matched: result.matched,
      description: describeCondition(rule.condition),
    });
    if (!result.matched) continue;

    for (const target of rule.targets) {
      const state = states[target];
      if (!state) continue;

      switch (rule.effect) {
        case "show": state.visible = true; break;
        case "hide": state.visible = false; break;
        case "enable": state.enabled = true; break;
        case "disable": state.enabled = false; break;
        case "require": state.required = true; break;
        case "optional": state.required = false; break;
      }
      state.appliedRules.push({ id: rule.id, effect: rule.effect });
    }
  }

  // A hidden field cannot be filled, so requiring it would make the form
  // unsubmittable with no visible cause.
  for (const state of Object.values(states)) {
    if (!state.visible && state.required) {
      state.required = false;
      state.appliedRules.push({ id: "_invariant", effect: "optional" });
    }
  }

  return { states, trace };
}

/** Builds a complete form: layout, state, lookups, defaults, calculations, validation. */
export function buildForm(
  entity: string,
  record: Record<string, unknown>,
  options: BuildFormOptions = {}
): FormState {
  if (!getEntity(entity)) {
    throw new Error(`[IDXF/dynamic-form-engine] unknown entity: ${entity}`);
  }

  const fields = getEntityFields(entity);

  // 1. Smart defaults fill empty fields before anything reads them.
  let working = { ...record };
  let defaults: DefaultResolution[] = [];
  if (options.defaultContext) {
    const resolved = resolveDefaults(entity, { ...options.defaultContext, record: working });
    working = resolved.record;
    defaults = resolved.defaults;
  }

  // 2. Calculations run next so rules and validation see derived values.
  const calculated = calculate(entity, working, {
    ...(options.now ? { now: options.now } : {}),
    ...(options.aggregateResolver ? { aggregateResolver: options.aggregateResolver } : {}),
  });
  working = calculated.record;

  // 3. Rules derive field state from the fully-populated record.
  const { states, trace } = applyRules(entity, working, fields);

  // 4. Lookup configuration comes from metadata, not the form.
  const lookups: LookupConfig[] = fields
    .filter((f) => f.targetEntity !== undefined)
    .map((f) => ({
      field: f.name,
      targetEntity: f.targetEntity as string,
      activeOnly: f.validation.activeOnly === true,
      aiSuggestions: f.aiSuggestions,
    }));

  const layout = buildLayout(entity, options);

  let validation: ValidationResult | undefined;
  if (options.validate) {
    validation = validateRecord(entity, working, {
      ...(options.validationStage ? { stage: options.validationStage } : {}),
    });
  }

  return {
    entity,
    layout,
    fieldStates: states,
    lookups,
    defaults,
    record: working,
    ...(validation ? { validation } : {}),
    ruleTrace: trace,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Recomputes form state after a single field changes.
 * Only rules reading the changed field — or a field derived from it — need
 * re-evaluating, but state is small enough that a full pass stays correct and
 * avoids a stale-state class of bug.
 */
export function onFieldChange(
  entity: string,
  record: Record<string, unknown>,
  changedField: string,
  newValue: unknown,
  options: BuildFormOptions = {}
): FormState & { affectedRules: string[] } {
  const next = { ...record, [changedField]: newValue };
  const state = buildForm(entity, next, options);

  const affectedRules = getFormRules(entity)
    .filter((r) => extractConditionFields(r.condition).includes(changedField))
    .map((r) => r.id);

  return { ...state, affectedRules };
}

/** Describes an entity's rule surface for the metadata API. */
export function describeFormRules(entity: string): Array<{
  id: string;
  label: string;
  effect: FormEffect;
  targets: string[];
  condition: string;
  reads: string[];
  enabled: boolean;
}> {
  return getFormRules(entity).map((rule) => ({
    id: rule.id,
    label: rule.label,
    effect: rule.effect,
    targets: rule.targets,
    condition: describeCondition(rule.condition),
    reads: extractConditionFields(rule.condition),
    enabled: rule.enabled,
  }));
}

// ── Pre-registered platform rules ─────────────────────────────────────────

registerFormRule({
  id: "job_provider_required_when_scheduled",
  entity: "job",
  label: "A scheduled job needs a provider",
  condition: { type: "comparison", comparison: { field: "scheduled_start", operator: "is_not_empty" } },
  effect: "require",
  targets: ["provider_id"],
  priority: 10,
});

registerFormRule({
  id: "job_hide_final_cost_until_complete",
  entity: "job",
  label: "Final cost appears once work is complete",
  condition: {
    type: "none",
    conditions: [{ type: "comparison", comparison: { field: "status", operator: "equals", value: "completed" } }],
  },
  effect: "hide",
  targets: ["final_cost_cents"],
  priority: 20,
});

registerFormRule({
  id: "provider_require_insurance_when_active",
  entity: "provider",
  label: "Active providers must carry insurance details",
  condition: {
    type: "comparison",
    comparison: { field: "status", operator: "in", value: ["active", "approved", "verified"] },
  },
  effect: "require",
  targets: ["insurance_number", "insurance_expiry"],
  priority: 10,
});

export function getFormEngineStats(): { entitiesWithRules: number; totalRules: number } {
  let totalRules = 0;
  for (const list of Array.from(RULES.values())) totalRules += list.length;
  return { entitiesWithRules: RULES.size, totalRules };
}
