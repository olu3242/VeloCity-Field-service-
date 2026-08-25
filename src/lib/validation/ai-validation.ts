/**
 * IDXF Engine 79 — AI Validation.
 *
 * Heuristic anomaly checks that sit alongside deterministic validation. These
 * never block a save on their own: they emit warnings and suggestions, because a
 * statistical outlier is a prompt for review, not proof of an error.
 *
 * The checks are deterministic heuristics over the record and an optional
 * baseline. Nothing here calls a model — an outbound inference call inside a
 * save path would add latency and a failure mode to every write. Model-backed
 * assistance lives in the AI Data Assistant (Engine 89), which is invoked
 * explicitly rather than implicitly.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import { getEntityFields, isNumericKind } from "@/lib/metadata/field-engine";

export interface AISignal {
  field: string;
  kind: "outlier" | "implausible" | "inconsistent" | "incomplete" | "suspicious_text";
  severity: "warning" | "suggestion";
  message: string;
  confidence: number;
  suggestion?: { field: string; value: unknown; description: string };
}

/** Observed distribution for a field, supplied by the caller from real data. */
export interface FieldBaseline {
  field: string;
  mean: number;
  stdDev: number;
  min?: number;
  max?: number;
  sampleSize: number;
}

export interface AIValidationOptions {
  baselines?: FieldBaseline[];
  /** Standard deviations beyond which a value is flagged. */
  outlierThreshold?: number;
}

const PLACEHOLDER_PATTERNS = [
  /^test$/i,
  /^testing$/i,
  /^asdf+$/i,
  /^qwerty$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^xxx+$/i,
  /^todo$/i,
  /^placeholder$/i,
  /^lorem ipsum/i,
  /^(.)\1{4,}$/, // same character repeated 5+ times
];

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Flags numeric values far from an observed baseline.
 * Requires a meaningful sample and a non-zero spread — with too few points, or
 * a constant history, "standard deviations from the mean" is not a real signal.
 */
export function detectOutliers(
  record: Record<string, unknown>,
  baselines: FieldBaseline[],
  threshold = 3
): AISignal[] {
  const signals: AISignal[] = [];

  for (const baseline of baselines) {
    if (baseline.sampleSize < 20 || baseline.stdDev <= 0) continue;
    const value = asNumber(record[baseline.field]);
    if (value === null) continue;

    const deviations = Math.abs(value - baseline.mean) / baseline.stdDev;
    if (deviations < threshold) continue;

    // Confidence rises with how far out the value is and how much data backs
    // the baseline, capped below certainty — this is a heuristic, not a proof.
    const confidence = Math.min(0.95, 0.5 + (deviations - threshold) * 0.1 + Math.min(0.2, baseline.sampleSize / 1000));

    signals.push({
      field: baseline.field,
      kind: "outlier",
      severity: "warning",
      message: `${baseline.field} of ${value} is ${deviations.toFixed(1)} standard deviations from the observed mean of ${baseline.mean.toFixed(2)} (n=${baseline.sampleSize}).`,
      confidence: Number(confidence.toFixed(2)),
    });
  }

  return signals;
}

/** Flags values that are structurally impossible for their field kind. */
export function detectImplausibleValues(
  entityKey: string,
  record: Record<string, unknown>
): AISignal[] {
  const signals: AISignal[] = [];

  for (const field of getEntityFields(entityKey)) {
    const raw = record[field.name];
    if (raw === null || raw === undefined || raw === "") continue;

    if (isNumericKind(field.kind)) {
      const value = asNumber(raw);
      if (value === null) continue;

      if (field.kind === "currency" && value < 0) {
        signals.push({
          field: field.name,
          kind: "implausible",
          severity: "warning",
          message: `${field.label} is negative (${value}); currency amounts are normally positive.`,
          confidence: 0.8,
          suggestion: { field: field.name, value: Math.abs(value), description: "Use the absolute value." },
        });
      }

      if (field.kind === "percentage" && (value < 0 || value > 1)) {
        // A percentage above 1 usually means the caller sent 85 rather than 0.85.
        signals.push({
          field: field.name,
          kind: "implausible",
          severity: "warning",
          message: `${field.label} is ${value}; percentage fields are stored as a 0–1 proportion.`,
          confidence: value > 1 && value <= 100 ? 0.85 : 0.6,
          ...(value > 1 && value <= 100
            ? { suggestion: { field: field.name, value: value / 100, description: "Convert from percent to proportion." } }
            : {}),
        });
      }
    }

    if (field.kind === "text" && typeof raw === "string") {
      const trimmed = raw.trim();
      if (PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed))) {
        signals.push({
          field: field.name,
          kind: "suspicious_text",
          severity: "warning",
          message: `${field.label} looks like placeholder text ("${trimmed}").`,
          confidence: 0.75,
        });
      }
    }
  }

  return signals;
}

/** Flags fields that are empty but materially useful to fill. */
export function detectIncompleteness(
  entityKey: string,
  record: Record<string, unknown>
): AISignal[] {
  const signals: AISignal[] = [];

  for (const field of getEntityFields(entityKey)) {
    // Required-but-empty is a hard validation error, reported there instead.
    if (field.validation.required) continue;
    if (field.readOnly) continue;
    const value = record[field.name];
    const empty = value === null || value === undefined || value === "";
    if (!empty) continue;

    // Only nudge on fields that drive downstream behaviour.
    if (field.searchable || field.aiSuggestions) {
      signals.push({
        field: field.name,
        kind: "incomplete",
        severity: "suggestion",
        message: `${field.label} is empty; populating it improves search and matching quality.`,
        confidence: 0.6,
      });
    }
  }

  return signals;
}

/** Flags internally contradictory numeric relationships. */
export function detectInconsistencies(record: Record<string, unknown>): AISignal[] {
  const signals: AISignal[] = [];

  const start = record.scheduled_start ? new Date(String(record.scheduled_start)) : null;
  const created = record.created_at ? new Date(String(record.created_at)) : null;
  if (start && created && !Number.isNaN(start.getTime()) && !Number.isNaN(created.getTime())) {
    if (start.getTime() < created.getTime()) {
      signals.push({
        field: "scheduled_start",
        kind: "inconsistent",
        severity: "warning",
        message: "Job is scheduled to start before it was created.",
        confidence: 0.9,
      });
    }
  }

  const estimated = asNumber(record.estimated_cost_cents);
  const final = asNumber(record.final_cost_cents);
  if (estimated !== null && final !== null && estimated > 0) {
    const ratio = final / estimated;
    if (ratio > 5) {
      signals.push({
        field: "final_cost_cents",
        kind: "inconsistent",
        severity: "warning",
        message: `Final cost is ${ratio.toFixed(1)}× the estimate — verify before invoicing.`,
        confidence: 0.8,
      });
    }
  }

  return signals;
}

export interface AIValidationResult {
  entity: string;
  signals: AISignal[];
  warningCount: number;
  suggestionCount: number;
  /** Highest confidence among emitted signals, 0 when none. */
  peakConfidence: number;
  /** AI signals never block persistence — they inform the operator. */
  blocksPersistence: false;
  evaluatedAt: string;
}

export function runAIValidation(
  entityKey: string,
  record: Record<string, unknown>,
  options: AIValidationOptions = {}
): AIValidationResult {
  const signals: AISignal[] = [
    ...detectImplausibleValues(entityKey, record),
    ...detectInconsistencies(record),
    ...detectIncompleteness(entityKey, record),
    ...(options.baselines ? detectOutliers(record, options.baselines, options.outlierThreshold ?? 3) : []),
  ];

  return {
    entity: entityKey,
    signals,
    warningCount: signals.filter((s) => s.severity === "warning").length,
    suggestionCount: signals.filter((s) => s.severity === "suggestion").length,
    peakConfidence: signals.reduce((max, s) => (s.confidence > max ? s.confidence : max), 0),
    blocksPersistence: false,
    evaluatedAt: new Date().toISOString(),
  };
}
