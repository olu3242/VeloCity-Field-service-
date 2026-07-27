/**
 * IDXF Engine 87 — Data Quality Engine.
 *
 * Scores every record on completeness, freshness, accuracy, consistency,
 * confidence and duplicate risk, and proposes concrete repair actions.
 *
 * Pure over a supplied record — no queries — so it is deterministic and the
 * caller keeps ownership of tenant-scoped reads.
 */

import { getEntityFields, isCalculatedKind } from "@/lib/metadata/field-engine";
import { getEntity } from "@/lib/metadata/entity-registry";
import { validateRecord } from "@/lib/validation/validation-engine";
import { runAIValidation } from "@/lib/validation/ai-validation";
import { type DuplicateReport } from "./duplicate-engine";

export type QualityDimension =
  | "completeness"
  | "freshness"
  | "accuracy"
  | "consistency"
  | "confidence"
  | "duplicate_risk";

export const QUALITY_DIMENSIONS: QualityDimension[] = [
  "completeness", "freshness", "accuracy", "consistency", "confidence", "duplicate_risk",
];

export interface DimensionScore {
  dimension: QualityDimension;
  /** 0–100. For duplicate_risk, higher is better (lower risk). */
  score: number;
  weight: number;
  detail: string;
  /** True when the dimension could not be assessed and was excluded. */
  notAssessed: boolean;
}

export type QualityGrade = "excellent" | "good" | "fair" | "poor";

export interface QualityAction {
  type: "repair" | "merge" | "review" | "notify" | "auto_complete";
  field?: string;
  description: string;
  priority: "low" | "medium" | "high";
  /** Value the runtime can apply without asking, when it is safe to do so. */
  suggestedValue?: unknown;
}

export interface QualityReport {
  entity: string;
  recordId: string | null;
  /** Weighted composite, 0–100. */
  score: number;
  grade: QualityGrade;
  dimensions: DimensionScore[];
  actions: QualityAction[];
  /** True when every dimension was assessable. */
  complete: boolean;
  meetsThreshold: boolean;
  threshold: number;
  generatedAt: string;
}

const DIMENSION_WEIGHTS: Record<QualityDimension, number> = {
  completeness: 0.3,
  accuracy: 0.25,
  consistency: 0.15,
  freshness: 0.1,
  confidence: 0.1,
  duplicate_risk: 0.1,
};

const DEFAULT_THRESHOLD = 70;

function toGrade(score: number): QualityGrade {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 55) return "fair";
  return "poor";
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

export interface QualityOptions {
  /** Duplicate report, when one was computed. */
  duplicates?: DuplicateReport;
  /** Threshold the record must reach to be considered acceptable. */
  threshold?: number;
  /** Field holding the last-updated timestamp. */
  freshnessField?: string;
  /** Days after which a record is considered fully stale. */
  stalenessDays?: number;
  now?: Date;
}

/**
 * Completeness weights required fields double: a missing required field is a
 * worse defect than a missing optional one.
 */
function scoreCompleteness(entity: string, record: Record<string, unknown>): DimensionScore {
  const fields = getEntityFields(entity).filter((f) => !isCalculatedKind(f.kind) && f.group !== "System");
  if (fields.length === 0) {
    return {
      dimension: "completeness",
      score: 0,
      weight: DIMENSION_WEIGHTS.completeness,
      detail: "Entity declares no assessable fields.",
      notAssessed: true,
    };
  }

  let earned = 0;
  let possible = 0;
  const missing: string[] = [];

  for (const field of fields) {
    const weight = field.validation.required ? 2 : 1;
    possible += weight;
    if (isEmpty(record[field.name])) missing.push(field.name);
    else earned += weight;
  }

  const score = Math.round((earned / possible) * 100);
  return {
    dimension: "completeness",
    score,
    weight: DIMENSION_WEIGHTS.completeness,
    detail: missing.length === 0
      ? "All assessable fields are populated."
      : `${missing.length} field(s) empty: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
    notAssessed: false,
  };
}

/** Accuracy is the inverse of hard validation failures. */
function scoreAccuracy(entity: string, record: Record<string, unknown>): DimensionScore {
  const result = validateRecord(entity, record, { stage: "before_save", skipAI: true });
  const fieldCount = Math.max(1, getEntityFields(entity).length);
  const penalty = Math.min(1, result.errors.length / fieldCount);
  const score = Math.round((1 - penalty) * 100);

  return {
    dimension: "accuracy",
    score,
    weight: DIMENSION_WEIGHTS.accuracy,
    detail: result.errors.length === 0
      ? "No validation errors."
      : `${result.errors.length} validation error(s).`,
    notAssessed: false,
  };
}

/** Consistency uses AI heuristics for internal contradictions. */
function scoreConsistency(entity: string, record: Record<string, unknown>): DimensionScore {
  const ai = runAIValidation(entity, record);
  const inconsistencies = ai.signals.filter(
    (s) => s.kind === "inconsistent" || s.kind === "implausible"
  );
  const score = Math.round(Math.max(0, 1 - inconsistencies.length * 0.25) * 100);

  return {
    dimension: "consistency",
    score,
    weight: DIMENSION_WEIGHTS.consistency,
    detail: inconsistencies.length === 0
      ? "No internal contradictions detected."
      : inconsistencies.map((s) => s.message).slice(0, 3).join(" "),
    notAssessed: false,
  };
}

/**
 * Freshness decays linearly to the staleness horizon.
 * Without a timestamp the dimension is marked not-assessed rather than scored 0,
 * which would unfairly penalise an entity that simply does not track updates.
 */
function scoreFreshness(
  record: Record<string, unknown>,
  options: QualityOptions
): DimensionScore {
  const field = options.freshnessField ?? "updated_at";
  const raw = record[field] ?? record.created_at;
  const stalenessDays = options.stalenessDays ?? 180;

  if (raw === null || raw === undefined) {
    return {
      dimension: "freshness",
      score: 0,
      weight: DIMENSION_WEIGHTS.freshness,
      detail: `No '${field}' timestamp — freshness not assessed.`,
      notAssessed: true,
    };
  }

  const timestamp = new Date(String(raw));
  if (Number.isNaN(timestamp.getTime())) {
    return {
      dimension: "freshness",
      score: 0,
      weight: DIMENSION_WEIGHTS.freshness,
      detail: `'${field}' is not a valid date — freshness not assessed.`,
      notAssessed: true,
    };
  }

  const now = options.now ?? new Date();
  const ageDays = (now.getTime() - timestamp.getTime()) / 86_400_000;
  const score = Math.round(Math.max(0, Math.min(1, 1 - ageDays / stalenessDays)) * 100);

  return {
    dimension: "freshness",
    score,
    weight: DIMENSION_WEIGHTS.freshness,
    detail: `Last updated ${Math.max(0, Math.round(ageDays))} day(s) ago.`,
    notAssessed: false,
  };
}

/** Confidence penalises placeholder and suspicious values. */
function scoreConfidence(entity: string, record: Record<string, unknown>): DimensionScore {
  const ai = runAIValidation(entity, record);
  const suspicious = ai.signals.filter((s) => s.kind === "suspicious_text" || s.kind === "outlier");
  const score = Math.round(Math.max(0, 1 - suspicious.length * 0.2) * 100);

  return {
    dimension: "confidence",
    score,
    weight: DIMENSION_WEIGHTS.confidence,
    detail: suspicious.length === 0
      ? "No suspicious values detected."
      : `${suspicious.length} field(s) look like placeholder or outlier data.`,
    notAssessed: false,
  };
}

function scoreDuplicateRisk(options: QualityOptions): DimensionScore {
  if (!options.duplicates) {
    return {
      dimension: "duplicate_risk",
      score: 0,
      weight: DIMENSION_WEIGHTS.duplicate_risk,
      detail: "No duplicate scan supplied — risk not assessed.",
      notAssessed: true,
    };
  }
  const risk = options.duplicates.topProbability;
  return {
    dimension: "duplicate_risk",
    score: Math.round((1 - risk) * 100),
    weight: DIMENSION_WEIGHTS.duplicate_risk,
    detail: risk === 0
      ? "No likely duplicates found."
      : `Closest match at ${Math.round(risk * 100)}% probability.`,
    notAssessed: false,
  };
}

function buildActions(
  entity: string,
  record: Record<string, unknown>,
  dimensions: DimensionScore[],
  options: QualityOptions
): QualityAction[] {
  const actions: QualityAction[] = [];

  const validation = validateRecord(entity, record, { stage: "before_save" });
  for (const fix of validation.autoFixes) {
    actions.push({
      type: "repair",
      field: fix.field,
      description: fix.description,
      priority: "high",
      suggestedValue: fix.value,
    });
  }

  for (const field of getEntityFields(entity)) {
    if (field.readOnly || !field.defaultRule) continue;
    if (!isEmpty(record[field.name])) continue;
    actions.push({
      type: "auto_complete",
      field: field.name,
      description: `${field.label} can be populated by the '${field.defaultRule}' default rule.`,
      priority: field.validation.required ? "high" : "low",
    });
  }

  const duplicates = options.duplicates;
  if (duplicates && duplicates.candidates.length > 0) {
    const top = duplicates.candidates[0];
    if (top && top.recommendation === "merge") {
      actions.push({
        type: "merge",
        description: `Likely duplicate of "${top.title}" (${top.confidence}% confidence).`,
        priority: "high",
      });
    } else if (top) {
      actions.push({
        type: "review",
        description: `Possible duplicate of "${top.title}" (${top.confidence}% confidence).`,
        priority: "medium",
      });
    }
  }

  const completeness = dimensions.find((d) => d.dimension === "completeness");
  if (completeness && completeness.score < 50) {
    actions.push({
      type: "notify",
      description: `Record is only ${completeness.score}% complete — notify the owning team.`,
      priority: "medium",
    });
  }

  return actions;
}

/** Scores a record across every quality dimension. */
export function scoreQuality(
  entity: string,
  record: Record<string, unknown>,
  options: QualityOptions = {}
): QualityReport {
  const definition = getEntity(entity);
  if (!definition) {
    throw new Error(`[IDXF/quality-engine] unknown entity: ${entity}`);
  }

  const dimensions: DimensionScore[] = [
    scoreCompleteness(entity, record),
    scoreAccuracy(entity, record),
    scoreConsistency(entity, record),
    scoreFreshness(record, options),
    scoreConfidence(entity, record),
    scoreDuplicateRisk(options),
  ];

  // Dimensions that could not be assessed are excluded from the composite and
  // their weight is redistributed, so a missing timestamp does not silently
  // drag the score down as though the data were bad.
  const assessed = dimensions.filter((d) => !d.notAssessed);
  const totalWeight = assessed.reduce((sum, d) => sum + d.weight, 0);
  const score = totalWeight === 0
    ? 0
    : Math.round(assessed.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight);

  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const idRaw = record[definition.primaryKeyField];

  return {
    entity,
    recordId: typeof idRaw === "string" ? idRaw : null,
    score,
    grade: toGrade(score),
    dimensions,
    actions: buildActions(entity, record, dimensions, options),
    complete: assessed.length === dimensions.length,
    meetsThreshold: score >= threshold,
    threshold,
    generatedAt: new Date().toISOString(),
  };
}

/** Aggregate quality across a set of records. */
export function scoreBatch(
  entity: string,
  records: Array<Record<string, unknown>>,
  options: QualityOptions = {}
): {
  entity: string;
  count: number;
  averageScore: number;
  byGrade: Record<QualityGrade, number>;
  belowThreshold: number;
  threshold: number;
} {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const byGrade: Record<QualityGrade, number> = { excellent: 0, good: 0, fair: 0, poor: 0 };
  let total = 0;
  let belowThreshold = 0;

  for (const record of records) {
    const report = scoreQuality(entity, record, options);
    total += report.score;
    byGrade[report.grade] += 1;
    if (!report.meetsThreshold) belowThreshold += 1;
  }

  return {
    entity,
    count: records.length,
    averageScore: records.length === 0 ? 0 : Math.round(total / records.length),
    byGrade,
    belowThreshold,
    threshold,
  };
}

export { DEFAULT_THRESHOLD as DEFAULT_QUALITY_THRESHOLD };
