/**
 * IDXF Engine 79 — Universal Validation Engine (UVE).
 *
 * Composes field-level validation, business rules, cross-record checks and AI
 * signals into a single verdict, evaluated at a declared lifecycle stage.
 *
 * Only deterministic errors block persistence. Warnings and AI signals surface
 * for review — a heuristic must never silently reject a legitimate save.
 */

import {
  getEntityFields,
  isNumericKind,
  type FieldMetadata,
} from "@/lib/metadata/field-engine";
import { getEntity } from "@/lib/metadata/entity-registry";
import { evaluateRules, type RuleSeverity } from "./business-rules";
import {
  runCrossRecordValidation,
  type CrossRecordOptions,
  type CrossRecordResult,
} from "./cross-record";
import { runAIValidation, type AIValidationOptions, type AIValidationResult } from "./ai-validation";

export type ValidationStage =
  | "before_save"
  | "before_dispatch"
  | "before_approval"
  | "before_payment"
  | "before_delete"
  | "before_automation";

export const VALIDATION_STAGES: ValidationStage[] = [
  "before_save",
  "before_dispatch",
  "before_approval",
  "before_payment",
  "before_delete",
  "before_automation",
];

export interface ValidationMessage {
  field: string;
  code: string;
  severity: RuleSeverity;
  message: string;
  autoFix?: { field: string; value: unknown; description: string };
}

// ── Format validators ─────────────────────────────────────────────────────

const FORMAT_VALIDATORS: Record<string, { test: (v: string) => boolean; label: string }> = {
  email: {
    // Deliberately permissive: the authoritative check is a confirmation email,
    // and an over-strict pattern rejects valid addresses.
    test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    label: "an email address",
  },
  phone: {
    test: (v) => {
      const digits = v.replace(/[^\d]/g, "");
      return digits.length >= 7 && digits.length <= 15;
    },
    label: "a phone number",
  },
  url: {
    test: (v) => /^https?:\/\/[^\s]+\.[^\s]+$/.test(v),
    label: "a URL",
  },
  uuid: {
    test: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    label: "a UUID",
  },
  iso_date: {
    test: (v) => !Number.isNaN(Date.parse(v)),
    label: "an ISO date",
  },
  postal_code: {
    test: (v) => /^[A-Za-z0-9][A-Za-z0-9\s-]{1,10}$/.test(v.trim()),
    label: "a postal code",
  },
};

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Validates one field against its declared metadata. */
export function validateField(
  field: FieldMetadata,
  value: unknown
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  if (isEmpty(value)) {
    if (field.validation.required) {
      messages.push({
        field: field.name,
        code: "required",
        severity: "error",
        message: `${field.label} is required.`,
      });
    }
    // Every other check is vacuous on an absent value.
    return messages;
  }

  if (isNumericKind(field.kind)) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) {
      messages.push({
        field: field.name,
        code: "not_a_number",
        severity: "error",
        message: `${field.label} must be a number.`,
      });
      return messages;
    }
    const { min, max } = field.validation;
    if (min !== undefined && num < min) {
      messages.push({
        field: field.name,
        code: "below_min",
        severity: "error",
        message: `${field.label} must be at least ${min}.`,
        autoFix: { field: field.name, value: min, description: `Raise to the minimum of ${min}.` },
      });
    }
    if (max !== undefined && num > max) {
      messages.push({
        field: field.name,
        code: "above_max",
        severity: "error",
        message: `${field.label} must be at most ${max}.`,
        autoFix: { field: field.name, value: max, description: `Lower to the maximum of ${max}.` },
      });
    }
  }

  if (typeof value === "string") {
    const { minLength, maxLength, format } = field.validation;
    if (minLength !== undefined && value.length < minLength) {
      messages.push({
        field: field.name,
        code: "too_short",
        severity: "error",
        message: `${field.label} must be at least ${minLength} characters.`,
      });
    }
    if (maxLength !== undefined && value.length > maxLength) {
      messages.push({
        field: field.name,
        code: "too_long",
        severity: "error",
        message: `${field.label} must be at most ${maxLength} characters.`,
        autoFix: {
          field: field.name,
          value: value.slice(0, maxLength),
          description: `Truncate to ${maxLength} characters.`,
        },
      });
    }
    if (format) {
      const validator = FORMAT_VALIDATORS[format];
      if (validator && !validator.test(value)) {
        messages.push({
          field: field.name,
          code: `invalid_${format}`,
          severity: "error",
          message: `${field.label} must be ${validator.label}.`,
        });
      }
    }
  }

  return messages;
}

export interface ValidationOptions {
  stage?: ValidationStage;
  /** Enables cross-record checks. Without it, references are not verified. */
  crossRecord?: Omit<CrossRecordOptions, "tenantId"> & { tenantId: string };
  ai?: AIValidationOptions;
  /** Skip AI signals entirely — used on hot automation paths. */
  skipAI?: boolean;
}

export interface ValidationResult {
  entity: string;
  stage: ValidationStage;
  valid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  suggestions: ValidationMessage[];
  /** Fixes the caller may apply automatically. */
  autoFixes: Array<{ field: string; value: unknown; description: string }>;
  crossRecord?: CrossRecordResult;
  ai?: AIValidationResult;
  /**
   * True when every configured check actually ran. False means references or
   * uniqueness were skipped for want of a resolver — the pass was partial.
   */
  complete: boolean;
  validatedAt: string;
  durationMs: number;
}

/**
 * Stage gating: which extra rigour a stage demands beyond before_save.
 * Later stages in a record's life are progressively less forgiving.
 */
const STAGE_REQUIRES_CROSS_RECORD: Record<ValidationStage, boolean> = {
  before_save: false,
  before_dispatch: true,
  before_approval: true,
  before_payment: true,
  before_delete: false,
  before_automation: true,
};

export function validateRecord(
  entityKey: string,
  record: Record<string, unknown>,
  options: ValidationOptions = {}
): ValidationResult {
  const started = Date.now();
  const stage = options.stage ?? "before_save";

  if (!getEntity(entityKey)) {
    throw new Error(`[IDXF/validation-engine] unknown entity: ${entityKey}`);
  }

  const messages: ValidationMessage[] = [];
  const fields = getEntityFields(entityKey);

  // 1. Field-level metadata validation.
  for (const field of fields) {
    // A read-only field's value is produced by the calculation engine, so
    // validating a caller-supplied value for it would report on data the
    // runtime is about to overwrite.
    if (field.readOnly && !field.validation.required) continue;
    messages.push(...validateField(field, record[field.name]));
  }

  // 2. Business rules declared on fields.
  const ruleIds = new Set<string>();
  for (const field of fields) {
    for (const id of field.validation.businessRules ?? []) ruleIds.add(id);
  }
  if (ruleIds.size > 0) {
    for (const outcome of evaluateRules(Array.from(ruleIds), record)) {
      if (outcome.passed) continue;
      messages.push({
        field: outcome.ruleId,
        code: `rule_${outcome.ruleId}`,
        severity: outcome.severity,
        message: outcome.message,
        ...(outcome.autoFix ? { autoFix: outcome.autoFix } : {}),
      });
    }
  }

  // 3. Cross-record checks.
  let crossRecord: CrossRecordResult | undefined;
  if (options.crossRecord) {
    crossRecord = runCrossRecordValidation(entityKey, record, options.crossRecord);
    for (const issue of crossRecord.issues) {
      messages.push({
        field: issue.field,
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
      });
    }
  }

  // 4. AI signals — advisory only.
  let ai: AIValidationResult | undefined;
  if (!options.skipAI) {
    ai = runAIValidation(entityKey, record, options.ai ?? {});
    for (const signal of ai.signals) {
      messages.push({
        field: signal.field,
        code: `ai_${signal.kind}`,
        severity: signal.severity,
        message: signal.message,
        ...(signal.suggestion ? { autoFix: signal.suggestion } : {}),
      });
    }
  }

  const errors = messages.filter((m) => m.severity === "error");
  const warnings = messages.filter((m) => m.severity === "warning");
  const suggestions = messages.filter((m) => m.severity === "suggestion");

  // A stage that demands cross-record verification is not satisfied by a pass
  // that skipped it — treat the omission as a blocking error rather than
  // reporting a clean result that was never actually checked.
  if (STAGE_REQUIRES_CROSS_RECORD[stage]) {
    if (!crossRecord) {
      errors.push({
        field: "_stage",
        code: "cross_record_required",
        severity: "error",
        message: `Stage '${stage}' requires cross-record validation, but no resolver was supplied.`,
      });
    } else if (!crossRecord.complete) {
      errors.push({
        field: "_stage",
        code: "cross_record_incomplete",
        severity: "error",
        message: `Stage '${stage}' requires full cross-record validation; these fields could not be verified: ${crossRecord.skippedFields.join(", ")}.`,
      });
    }
  }

  const autoFixes = messages
    .filter((m) => m.autoFix !== undefined)
    .map((m) => m.autoFix as { field: string; value: unknown; description: string });

  return {
    entity: entityKey,
    stage,
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    autoFixes,
    ...(crossRecord ? { crossRecord } : {}),
    ...(ai ? { ai } : {}),
    complete: crossRecord ? crossRecord.complete : !STAGE_REQUIRES_CROSS_RECORD[stage],
    validatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}

/** Applies every suggested auto-fix, returning a new record. */
export function applyAutoFixes(
  record: Record<string, unknown>,
  fixes: Array<{ field: string; value: unknown }>
): Record<string, unknown> {
  const next = { ...record };
  for (const fix of fixes) next[fix.field] = fix.value;
  return next;
}

/** Convenience guard for write paths: throws unless the record is valid. */
export function assertValid(result: ValidationResult): void {
  if (result.valid) return;
  const summary = result.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
  throw new Error(`[IDXF/validation] ${result.entity} failed ${result.stage}: ${summary}`);
}
