/**
 * IDXF Integration — Shadow Validation.
 *
 * Runs the IDXF validation engine alongside a domain route's existing checks and
 * records whether the two agree. It never blocks a request and never changes a
 * response: adopting a new validation layer by switching it on in the write path
 * would reject writes the platform currently accepts, which is exactly the kind
 * of change that cannot be made blind.
 *
 * Instead this builds the evidence to make that decision: where IDXF is stricter
 * than the legacy path, on which fields, and how often. Once agreement is high
 * and the divergences are understood, enforcement can be turned on per entity
 * with a known blast radius.
 *
 * Every shadow call is wrapped so a fault in the shadow path can never surface
 * as a failure in the real one.
 */

// Bootstraps the entity/field registries. Importing the sub-modules alone
// leaves the registries empty, which would make every observation record
// "unknown_entity" and silently produce no usable evidence at all.
import "@/lib/metadata";

import { validateRecord, type ValidationStage } from "@/lib/validation/validation-engine";
import { scoreQuality } from "@/lib/quality/quality-engine";
import { getEntity } from "@/lib/metadata/entity-registry";
import { getEntityFields } from "@/lib/metadata/field-engine";
import { logger } from "@/lib/logger";

export type ShadowVerdict =
  /** Both the legacy route and IDXF accept the record. */
  | "agreed_accept"
  /** Both reject. */
  | "agreed_reject"
  /** Legacy accepted, IDXF would have rejected — the interesting case. */
  | "idxf_stricter"
  /** Legacy rejected, IDXF would have accepted. */
  | "idxf_permissive"
  /** The shadow run itself failed; no comparison is possible. */
  | "shadow_error";

export interface ShadowObservation {
  id: string;
  entity: string;
  tenantId: string;
  stage: ValidationStage;
  verdict: ShadowVerdict;
  /** Whether the route's own validation accepted the payload. */
  legacyAccepted: boolean;
  idxfAccepted: boolean;
  /** Fields IDXF rejected, for divergence analysis. */
  idxfErrorFields: string[];
  idxfErrorCodes: string[];
  warningCount: number;
  qualityScore: number | null;
  /** Fields present in the payload that the entity does not declare. */
  unknownFields: string[];
  /** Declared fields the payload omitted entirely. */
  absentFields: string[];
  durationMs: number;
  observedAt: string;
}

const OBSERVATIONS: ShadowObservation[] = [];
const OBSERVATION_CAP = 2000;

export interface ShadowContext {
  tenantId: string;
  /** Whether the route's own validation passed. */
  legacyAccepted: boolean;
  stage?: ValidationStage;
  /** Compute a quality score too. Off by default — it runs extra passes. */
  scoreQuality?: boolean;
  /** Identifies the calling route in logs. */
  source: string;
}

function classify(legacyAccepted: boolean, idxfAccepted: boolean): ShadowVerdict {
  if (legacyAccepted && idxfAccepted) return "agreed_accept";
  if (!legacyAccepted && !idxfAccepted) return "agreed_reject";
  if (legacyAccepted && !idxfAccepted) return "idxf_stricter";
  return "idxf_permissive";
}

/**
 * Runs IDXF validation in shadow and records the comparison.
 *
 * Returns the observation for callers that want to attach it to telemetry, but
 * the return value is deliberately not something a route should branch on —
 * acting on it would make this a blocking check by the back door.
 */
export function shadowValidate(
  entity: string,
  payload: Record<string, unknown>,
  context: ShadowContext
): ShadowObservation {
  const started = Date.now();
  const stage = context.stage ?? "before_save";

  const base = {
    id: crypto.randomUUID(),
    entity,
    tenantId: context.tenantId,
    stage,
    legacyAccepted: context.legacyAccepted,
    observedAt: new Date().toISOString(),
  };

  try {
    if (!getEntity(entity)) {
      const observation: ShadowObservation = {
        ...base,
        verdict: "shadow_error",
        idxfAccepted: false,
        idxfErrorFields: [],
        idxfErrorCodes: ["unknown_entity"],
        warningCount: 0,
        qualityScore: null,
        unknownFields: [],
        absentFields: [],
        durationMs: Date.now() - started,
      };
      record(observation, context.source);
      return observation;
    }

    // Cross-record checks need a tenant-scoped resolver the shadow path does not
    // have, so validation runs at before_save depth. Reporting a stage that
    // demands resolvers would produce a guaranteed failure that says nothing
    // about the legacy path.
    const result = validateRecord(entity, payload, { stage, skipAI: true });

    const declared = new Set(getEntityFields(entity).map((f) => f.name));
    const present = new Set(Object.keys(payload));

    const unknownFields = Array.from(present).filter((k) => !declared.has(k)).sort();
    const absentFields = Array.from(declared).filter((k) => !present.has(k)).sort();

    let qualityScore: number | null = null;
    if (context.scoreQuality) {
      qualityScore = scoreQuality(entity, payload).score;
    }

    const observation: ShadowObservation = {
      ...base,
      verdict: classify(context.legacyAccepted, result.valid),
      idxfAccepted: result.valid,
      idxfErrorFields: Array.from(new Set(result.errors.map((e) => e.field))).sort(),
      idxfErrorCodes: Array.from(new Set(result.errors.map((e) => e.code))).sort(),
      warningCount: result.warnings.length,
      qualityScore,
      unknownFields,
      absentFields,
      durationMs: Date.now() - started,
    };

    record(observation, context.source);
    return observation;
  } catch (err) {
    // A shadow fault must never propagate into the request it is observing.
    const observation: ShadowObservation = {
      ...base,
      verdict: "shadow_error",
      idxfAccepted: false,
      idxfErrorFields: [],
      idxfErrorCodes: ["shadow_exception"],
      warningCount: 0,
      qualityScore: null,
      unknownFields: [],
      absentFields: [],
      durationMs: Date.now() - started,
    };
    OBSERVATIONS.push(observation);
    enforceCap();
    logger.warn("idxf.shadow.error", {
      entity,
      source: context.source,
      error: err instanceof Error ? err.message : String(err),
    });
    return observation;
  }
}

function enforceCap(): void {
  if (OBSERVATIONS.length > OBSERVATION_CAP) {
    OBSERVATIONS.splice(0, OBSERVATIONS.length - OBSERVATION_CAP);
  }
}

function record(observation: ShadowObservation, source: string): void {
  OBSERVATIONS.push(observation);
  enforceCap();

  // Only divergences are worth a log line; agreement is the expected case and
  // logging it would bury the signal.
  if (observation.verdict === "idxf_stricter" || observation.verdict === "idxf_permissive") {
    logger.info("idxf.shadow.divergence", {
      entity: observation.entity,
      source,
      verdict: observation.verdict,
      fields: observation.idxfErrorFields,
      codes: observation.idxfErrorCodes,
    });
  }
}

/**
 * Non-throwing wrapper for use directly inside a route.
 * Swallows everything — a route should not need its own try/catch to stay safe.
 */
export function observe(
  entity: string,
  payload: Record<string, unknown>,
  context: ShadowContext
): void {
  try {
    shadowValidate(entity, payload, context);
  } catch {
    // Already handled inside shadowValidate; this is the last line of defence.
  }
}

// ── Adoption reporting ────────────────────────────────────────────────────

export interface FieldDivergence {
  field: string;
  /** Times IDXF rejected on this field while the legacy path accepted. */
  count: number;
  codes: string[];
  share: number;
}

export interface AdoptionReport {
  entity: string;
  observations: number;
  byVerdict: Record<ShadowVerdict, number>;
  /** Share of observations where both layers agreed, 0–1. */
  agreementRate: number;
  /** Divergences ranked by frequency — the work list before enforcing. */
  divergentFields: FieldDivergence[];
  /** Payload keys the entity does not declare — metadata gaps. */
  undeclaredFields: Array<{ field: string; count: number }>;
  averageQualityScore: number | null;
  averageShadowMs: number;
  /**
   * Whether enforcement can be turned on safely: enough evidence, no
   * unexplained strictness, and no shadow faults.
   */
  readyToEnforce: boolean;
  blockers: string[];
  generatedAt: string;
}

/** Minimum observations before an agreement rate means anything. */
const MIN_OBSERVATIONS = 50;
/** Agreement below this leaves too much unexplained to enforce. */
const MIN_AGREEMENT = 0.98;

export function getAdoptionReport(entity: string, tenantId?: string): AdoptionReport {
  const scoped = OBSERVATIONS.filter(
    (o) => o.entity === entity && (tenantId === undefined || o.tenantId === tenantId)
  );

  const byVerdict: Record<ShadowVerdict, number> = {
    agreed_accept: 0,
    agreed_reject: 0,
    idxf_stricter: 0,
    idxf_permissive: 0,
    shadow_error: 0,
  };
  for (const o of scoped) byVerdict[o.verdict] += 1;

  const agreed = byVerdict.agreed_accept + byVerdict.agreed_reject;
  const agreementRate = scoped.length === 0 ? 0 : agreed / scoped.length;

  // Rank the fields responsible for IDXF being stricter — these are what must be
  // understood (or the metadata corrected) before enforcement.
  const fieldCounts = new Map<string, { count: number; codes: Set<string> }>();
  for (const o of scoped) {
    if (o.verdict !== "idxf_stricter") continue;
    for (const field of o.idxfErrorFields) {
      const entry = fieldCounts.get(field) ?? { count: 0, codes: new Set<string>() };
      entry.count += 1;
      for (const code of o.idxfErrorCodes) entry.codes.add(code);
      fieldCounts.set(field, entry);
    }
  }

  const stricterCount = byVerdict.idxf_stricter;
  const divergentFields: FieldDivergence[] = Array.from(fieldCounts.entries())
    .map(([field, entry]) => ({
      field,
      count: entry.count,
      codes: Array.from(entry.codes).sort(),
      share: stricterCount === 0 ? 0 : Number((entry.count / stricterCount).toFixed(4)),
    }))
    .sort((a, b) => b.count - a.count);

  const undeclaredCounts = new Map<string, number>();
  for (const o of scoped) {
    for (const field of o.unknownFields) {
      undeclaredCounts.set(field, (undeclaredCounts.get(field) ?? 0) + 1);
    }
  }

  const qualityScores = scoped
    .map((o) => o.qualityScore)
    .filter((s): s is number => s !== null);

  const blockers: string[] = [];
  if (scoped.length < MIN_OBSERVATIONS) {
    blockers.push(
      `Only ${scoped.length} observation(s); at least ${MIN_OBSERVATIONS} are needed before the agreement rate is meaningful.`
    );
  }
  if (byVerdict.shadow_error > 0) {
    blockers.push(`${byVerdict.shadow_error} shadow run(s) errored — the comparison is incomplete.`);
  }
  if (scoped.length >= MIN_OBSERVATIONS && agreementRate < MIN_AGREEMENT) {
    blockers.push(
      `Agreement is ${(agreementRate * 100).toFixed(1)}%, below the ${(MIN_AGREEMENT * 100).toFixed(0)}% bar. Enforcing now would reject writes the platform currently accepts.`
    );
  }
  if (divergentFields.length > 0) {
    blockers.push(
      `IDXF is stricter on: ${divergentFields.slice(0, 5).map((d) => d.field).join(", ")}. Reconcile the metadata or the legacy rule before enforcing.`
    );
  }

  return {
    entity,
    observations: scoped.length,
    byVerdict,
    agreementRate: Number(agreementRate.toFixed(4)),
    divergentFields,
    undeclaredFields: Array.from(undeclaredCounts.entries())
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count),
    averageQualityScore:
      qualityScores.length === 0
        ? null
        : Math.round(qualityScores.reduce((s, v) => s + v, 0) / qualityScores.length),
    averageShadowMs:
      scoped.length === 0
        ? 0
        : Number((scoped.reduce((s, o) => s + o.durationMs, 0) / scoped.length).toFixed(2)),
    readyToEnforce: blockers.length === 0,
    blockers,
    generatedAt: new Date().toISOString(),
  };
}

/** Adoption across every entity that has been observed. */
export function getAdoptionSummary(tenantId?: string): {
  entities: AdoptionReport[];
  totalObservations: number;
  entitiesReadyToEnforce: string[];
  overallAgreement: number;
} {
  const entities = Array.from(
    new Set(
      OBSERVATIONS.filter((o) => tenantId === undefined || o.tenantId === tenantId).map(
        (o) => o.entity
      )
    )
  ).sort();

  const reports = entities.map((e) => getAdoptionReport(e, tenantId));
  const total = reports.reduce((s, r) => s + r.observations, 0);
  const weighted = reports.reduce((s, r) => s + r.agreementRate * r.observations, 0);

  return {
    entities: reports,
    totalObservations: total,
    entitiesReadyToEnforce: reports.filter((r) => r.readyToEnforce).map((r) => r.entity),
    overallAgreement: total === 0 ? 0 : Number((weighted / total).toFixed(4)),
  };
}

/** Recent raw observations, for drilling into a specific divergence. */
export function getObservations(
  options: { entity?: string; tenantId?: string; verdict?: ShadowVerdict; limit?: number } = {}
): ShadowObservation[] {
  return OBSERVATIONS.filter(
    (o) =>
      (options.entity === undefined || o.entity === options.entity) &&
      (options.tenantId === undefined || o.tenantId === options.tenantId) &&
      (options.verdict === undefined || o.verdict === options.verdict)
  )
    .slice(-(options.limit ?? 50))
    .reverse();
}

export function clearObservations(entity?: string): number {
  if (!entity) {
    const count = OBSERVATIONS.length;
    OBSERVATIONS.length = 0;
    return count;
  }
  let removed = 0;
  for (let i = OBSERVATIONS.length - 1; i >= 0; i--) {
    if (OBSERVATIONS[i]?.entity === entity) {
      OBSERVATIONS.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

export const ADOPTION_THRESHOLDS = {
  minObservations: MIN_OBSERVATIONS,
  minAgreement: MIN_AGREEMENT,
};
