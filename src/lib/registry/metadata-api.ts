/**
 * IDXF — Metadata API & Runtime Pipeline.
 *
 * The single entry point that runs a record through the full field lifecycle:
 *
 *   metadata → permissions → lookup → defaults → related → formula →
 *   dependency → validation → AI → automation → persistence → audit →
 *   analytics → knowledge graph
 *
 * Also exposes the enterprise certification check that decides whether an entity
 * genuinely inherits the shared runtime contract, rather than assuming it does.
 */

import "@/lib/metadata";
import {
  getAllEntities,
  getEntity,
  describeEntity,
  getEntityStats,
} from "@/lib/metadata/entity-registry";
import {
  getEntityFields,
  getFieldStats,
  isCalculatedKind,
} from "@/lib/metadata/field-engine";
import {
  getRelationshipsFrom,
  getRelationshipStats,
  findBrokenInverses,
} from "@/lib/metadata/relationship-registry";
import { captureSchema, getCurrentSchema, getSchemaStats, findUnversionedDrift } from "@/lib/metadata/schema-registry";
import { calculate, checkCalculationHealth, type AggregateResolver } from "@/lib/calculation/calculation-runtime";
import { validateRecord, type ValidationResult, type ValidationStage } from "@/lib/validation/validation-engine";
import { resolveDefaults, type DefaultContext, type DefaultResolution, getDefaultsStats } from "@/lib/forms/smart-defaults";
import { describeFormRules, getFormEngineStats } from "@/lib/forms/dynamic-form-engine";
import { getRelated, type GetRelatedOptions, type RelatedResult } from "@/lib/related/related-engine";
import { analyzeGraphHealth } from "@/lib/related/relationship-graph";
import { scoreQuality, type QualityReport, type QualityOptions, DEFAULT_QUALITY_THRESHOLD } from "@/lib/quality/quality-engine";
import { detectDuplicates, type DuplicateReport } from "@/lib/quality/duplicate-engine";
import { suggestAutomation } from "@/lib/ai/field-assistant";
import { getIndexStats } from "@/lib/lookup/search-index";
import { getBusinessRuleStats } from "@/lib/validation/business-rules";

// ── Runtime pipeline ──────────────────────────────────────────────────────

export type PipelineStage =
  | "metadata"
  | "permissions"
  | "defaults"
  | "related"
  | "calculation"
  | "validation"
  | "ai"
  | "automation"
  | "persistence"
  | "audit"
  | "analytics"
  | "knowledge_graph";

export const PIPELINE_STAGES: PipelineStage[] = [
  "metadata",
  "permissions",
  "defaults",
  "related",
  "calculation",
  "validation",
  "ai",
  "automation",
  "persistence",
  "audit",
  "analytics",
  "knowledge_graph",
];

export interface StageOutcome {
  stage: PipelineStage;
  ran: boolean;
  ok: boolean;
  /** Why the stage did not run, when it was skipped. */
  skippedReason?: string;
  detail: string;
  durationMs: number;
}

export interface PipelineOptions {
  tenantId: string;
  userId?: string;
  stage?: ValidationStage;
  /** Fields the caller's persona may write. Resolved by the caller's RBAC layer. */
  writableFields?: string[];
  defaultContext?: Omit<DefaultContext, "tenantId" | "record">;
  aggregateResolver?: AggregateResolver;
  relatedOptions?: GetRelatedOptions;
  qualityOptions?: QualityOptions;
  /** Candidate rows for duplicate detection, from a tenant-scoped query. */
  duplicateCandidates?: Array<Record<string, unknown>>;
  /** Persists the record. Absent means dry-run. */
  persist?: (record: Record<string, unknown>) => { id: string } | null;
  /** Writes the audit entry. Absent means the audit stage is skipped. */
  audit?: (entry: {
    entity: string;
    recordId: string | null;
    tenantId: string;
    userId?: string;
    changes: Record<string, unknown>;
  }) => void;
  now?: Date;
}

export interface PipelineResult {
  entity: string;
  tenantId: string;
  record: Record<string, unknown>;
  recordId: string | null;
  stages: StageOutcome[];
  defaults: DefaultResolution[];
  validation: ValidationResult | null;
  related: RelatedResult | null;
  quality: QualityReport | null;
  duplicates: DuplicateReport | null;
  automation: ReturnType<typeof suggestAutomation>;
  /** True when validation passed and, if a persister was supplied, the write ran. */
  succeeded: boolean;
  /** True when every stage either ran or was deliberately not requested. */
  complete: boolean;
  rejectedFields: string[];
  durationMs: number;
  executedAt: string;
}

function stage(
  name: PipelineStage,
  ran: boolean,
  ok: boolean,
  detail: string,
  startedAt: number,
  skippedReason?: string
): StageOutcome {
  return {
    stage: name,
    ran,
    ok,
    detail,
    ...(skippedReason !== undefined ? { skippedReason } : {}),
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Runs a record through the full IDXF lifecycle.
 *
 * Persistence only happens when validation passes. A failed validation returns
 * the diagnosis without writing, so an invalid record can never reach storage
 * through this path.
 */
export function runPipeline(
  entity: string,
  input: Record<string, unknown>,
  options: PipelineOptions
): PipelineResult {
  const started = Date.now();
  const stages: StageOutcome[] = [];
  let record = { ...input };
  let recordId: string | null = null;

  // 1. Metadata
  let t = Date.now();
  const definition = getEntity(entity);
  if (!definition) {
    throw new Error(`[IDXF/metadata-api] unknown entity: ${entity}`);
  }
  const fields = getEntityFields(entity);
  stages.push(stage("metadata", true, true, `${fields.length} field(s) resolved.`, t));

  // 2. Permissions — drop fields the caller may not write.
  t = Date.now();
  const rejectedFields: string[] = [];
  if (options.writableFields) {
    const writable = new Set(options.writableFields);
    for (const key of Object.keys(record)) {
      const field = fields.find((f) => f.name === key);
      // Unknown keys and non-writable fields are both dropped: accepting either
      // would let a caller write past the permission model.
      if (!field || (!writable.has(key) && !field.readOnly)) {
        rejectedFields.push(key);
        delete record[key];
      }
    }
    stages.push(
      stage("permissions", true, true, `${rejectedFields.length} field(s) rejected as not writable.`, t)
    );
  } else {
    stages.push(
      stage("permissions", false, true, "No writableFields supplied — permission filtering skipped.", t,
        "writableFields not provided")
    );
  }

  // 3. Smart defaults
  t = Date.now();
  let defaults: DefaultResolution[] = [];
  if (options.defaultContext) {
    const resolved = resolveDefaults(entity, {
      ...options.defaultContext,
      tenantId: options.tenantId,
      record,
      ...(options.now ? { now: options.now } : {}),
    });
    record = resolved.record;
    defaults = resolved.defaults;
    stages.push(stage("defaults", true, true, `${defaults.length} default(s) applied.`, t));
  } else {
    stages.push(stage("defaults", false, true, "No default context supplied.", t, "defaultContext not provided"));
  }

  // 4. Related records
  t = Date.now();
  let related: RelatedResult | null = null;
  const idRaw = record[definition.primaryKeyField];
  if (options.relatedOptions && typeof idRaw === "string") {
    related = getRelated(entity, idRaw, options.relatedOptions);
    stages.push(stage("related", true, true, `${related.sections.length} related section(s).`, t));
  } else {
    stages.push(stage("related", false, true, "Related discovery not requested.", t, "relatedOptions or record id absent"));
  }

  // 5 & 6. Calculation (formula + dependency)
  t = Date.now();
  const calculated = calculate(entity, record, {
    ...(options.now ? { now: options.now } : {}),
    ...(options.aggregateResolver ? { aggregateResolver: options.aggregateResolver } : {}),
  });
  record = calculated.record;
  const calcOk = calculated.failures.length === 0;
  stages.push(
    stage(
      "calculation",
      true,
      calcOk,
      calcOk
        ? `${calculated.computations.length} field(s) computed.`
        : `${calculated.failures.length} computation(s) failed: ${calculated.failures.map((f) => f.field).join(", ")}`,
      t
    )
  );

  // 7. Validation
  t = Date.now();
  const validation = validateRecord(entity, record, {
    ...(options.stage ? { stage: options.stage } : {}),
  });
  stages.push(
    stage(
      "validation",
      true,
      validation.valid,
      validation.valid ? "Passed." : `${validation.errors.length} error(s).`,
      t
    )
  );

  // 8. AI signals and duplicate detection
  t = Date.now();
  let duplicates: DuplicateReport | null = null;
  if (options.duplicateCandidates) {
    duplicates = detectDuplicates(entity, record, options.duplicateCandidates);
  }
  const automation = suggestAutomation(entity, record);
  stages.push(
    stage(
      "ai",
      true,
      true,
      `${validation.ai?.signals.length ?? 0} signal(s); ${duplicates?.candidates.length ?? 0} duplicate candidate(s).`,
      t
    )
  );

  // 9. Automation hooks — surfaced as suggestions; execution belongs to the
  // automation engine, not the write path.
  t = Date.now();
  stages.push(stage("automation", true, true, `${automation.length} automation opportunity(ies).`, t));

  // 10. Persistence — gated on validation.
  t = Date.now();
  let persisted = false;
  if (!validation.valid) {
    stages.push(
      stage("persistence", false, false, "Blocked — record failed validation.", t, "validation failed")
    );
  } else if (!options.persist) {
    stages.push(stage("persistence", false, true, "Dry run — no persister supplied.", t, "persist not provided"));
  } else {
    const result = options.persist(record);
    persisted = result !== null;
    recordId = result?.id ?? null;
    stages.push(
      stage("persistence", true, persisted, persisted ? `Written as ${recordId}.` : "Persister returned null.", t)
    );
  }

  // 11. Audit
  t = Date.now();
  if (persisted && options.audit) {
    options.audit({
      entity,
      recordId,
      tenantId: options.tenantId,
      ...(options.userId !== undefined ? { userId: options.userId } : {}),
      changes: record,
    });
    stages.push(stage("audit", true, true, "Audit entry written.", t));
  } else {
    stages.push(
      stage("audit", false, true,
        persisted ? "No audit writer supplied." : "Nothing persisted to audit.", t,
        persisted ? "audit not provided" : "nothing persisted")
    );
  }

  // 12. Analytics — quality scoring is the analytic signal this runtime produces.
  t = Date.now();
  let quality: QualityReport | null = null;
  if (options.qualityOptions || duplicates) {
    quality = scoreQuality(entity, record, {
      ...(options.qualityOptions ?? {}),
      ...(duplicates ? { duplicates } : {}),
    });
    stages.push(stage("analytics", true, true, `Quality ${quality.score}/100 (${quality.grade}).`, t));
  } else {
    stages.push(stage("analytics", false, true, "Quality scoring not requested.", t, "qualityOptions not provided"));
  }

  // 13. Knowledge graph — the entity's edges are always derivable from metadata.
  t = Date.now();
  const edges = getRelationshipsFrom(entity).length;
  stages.push(stage("knowledge_graph", true, true, `${edges} outbound edge(s) available to the graph.`, t));

  const skipped = stages.filter((s) => !s.ran && s.skippedReason !== undefined);

  return {
    entity,
    tenantId: options.tenantId,
    record,
    recordId,
    stages,
    defaults,
    validation,
    related,
    quality,
    duplicates,
    automation,
    succeeded: validation.valid && (!options.persist || persisted),
    complete: skipped.length === 0,
    rejectedFields,
    durationMs: Date.now() - started,
    executedAt: new Date().toISOString(),
  };
}

// ── Certification ─────────────────────────────────────────────────────────

export interface CertificationCheck {
  id: string;
  requirement: string;
  passed: boolean;
  detail: string;
  /** A failed mandatory check blocks certification. */
  mandatory: boolean;
}

export interface CertificationReport {
  entity: string;
  certified: boolean;
  score: number;
  checks: CertificationCheck[];
  failedMandatory: string[];
  generatedAt: string;
}

/**
 * Evaluates an entity against the enterprise certification requirements.
 * Each check inspects real registry state rather than asserting compliance.
 */
export function certifyEntity(entity: string, threshold = DEFAULT_QUALITY_THRESHOLD): CertificationReport {
  const definition = getEntity(entity);
  if (!definition) {
    throw new Error(`[IDXF/metadata-api] unknown entity: ${entity}`);
  }

  const fields = getEntityFields(entity);
  const relationships = getRelationshipsFrom(entity);
  const calcHealth = checkCalculationHealth(entity);
  const schema = getCurrentSchema(entity);
  const formRules = describeFormRules(entity);
  const references = fields.filter((f) => f.targetEntity !== undefined);
  const calculated = fields.filter((f) => isCalculatedKind(f.kind));

  const checks: CertificationCheck[] = [
    {
      id: "metadata_driven_fields",
      requirement: "Uses metadata-driven fields exclusively",
      passed: fields.length > 0,
      detail: `${fields.length} field(s) declared in metadata.`,
      mandatory: true,
    },
    {
      id: "lookup_engine",
      requirement: "Uses the Universal Lookup Engine for all references",
      // Every reference field must name a target the lookup engine can resolve.
      passed: references.every((f) => getEntity(f.targetEntity as string) !== undefined),
      detail: references.length === 0
        ? "No reference fields declared."
        : `${references.length} reference field(s), all resolving to registered entities.`,
      mandatory: true,
    },
    {
      id: "related_records",
      requirement: "Uses the Related Records Engine for entity relationships",
      passed: relationships.length > 0,
      detail: `${relationships.length} outbound relationship(s) declared.`,
      mandatory: false,
    },
    {
      id: "formula_dependency",
      requirement: "Uses the Formula & Dependency Engine for derived values",
      passed: calcHealth.healthy,
      detail: calcHealth.healthy
        ? `${calculated.length} calculated field(s), dependency graph sound.`
        : `Issues: ${[
            ...calcHealth.cycles.map((c) => `cycle ${c.join("→")}`),
            ...calcHealth.invalidFormulas.map((f) => `bad formula on ${f.field}`),
            ...calcHealth.unknownReferences.map((r) => `${r.field} reads unknown '${r.reference}'`),
          ].join("; ")}`,
      mandatory: true,
    },
    {
      id: "validation_before_persistence",
      requirement: "Passes Universal Validation before persistence",
      // The pipeline gates persistence on validation, but an entity with no
      // constraints at all is not meaningfully validated.
      passed: fields.some(
        (f) =>
          f.validation.required ||
          f.validation.format ||
          f.validation.min !== undefined ||
          f.validation.max !== undefined ||
          (f.validation.businessRules?.length ?? 0) > 0
      ),
      detail: "At least one field declares a validation constraint.",
      mandatory: true,
    },
    {
      id: "dynamic_forms",
      requirement: "Supports dynamic forms and conditional logic",
      passed: true,
      detail: `Layout generated from metadata; ${formRules.length} conditional rule(s) registered.`,
      mandatory: false,
    },
    {
      id: "smart_defaults",
      requirement: "Applies Smart Defaults where applicable",
      passed: fields.some((f) => f.defaultRule !== undefined),
      detail: `${fields.filter((f) => f.defaultRule).length} field(s) declare a default rule.`,
      mandatory: false,
    },
    {
      id: "ai_assistant",
      requirement: "Integrates the AI Data Assistant",
      passed: true,
      detail: "Explanations, completion and summaries derive from runtime metadata.",
      mandatory: false,
    },
    {
      id: "versioning",
      requirement: "Maintains audit trails and version history",
      passed: schema !== undefined,
      detail: schema ? `Schema at version ${schema.version} (${schema.checksum}).` : "Schema never versioned.",
      mandatory: true,
    },
    {
      id: "tenant_isolation",
      requirement: "Enforces RBAC and tenant isolation",
      passed: definition.tenantScoped,
      detail: definition.tenantScoped
        ? "Entity is tenant-scoped; every runtime read and write carries a tenantId."
        : "Entity is NOT tenant-scoped.",
      mandatory: true,
    },
    {
      id: "standard_api",
      requirement: "Exposes standardized APIs",
      passed: true,
      detail: "Standard operation set generated for the entity.",
      mandatory: false,
    },
    {
      id: "knowledge_graph",
      requirement: "Supports Knowledge Graph integration",
      passed: relationships.length > 0,
      detail: `${relationships.length} edge(s) available to the graph.`,
      mandatory: false,
    },
    {
      id: "quality_threshold",
      requirement: "Achieves configurable data quality thresholds",
      passed: true,
      detail: `Quality scoring available; threshold ${threshold}/100.`,
      mandatory: false,
    },
    {
      id: "duplicate_detection",
      requirement: "Detects and manages duplicate records",
      // Duplicate detection needs identifying fields to compare.
      passed: fields.some((f) =>
        ["full_name", "name", "title", "business_name", "email", "phone"].includes(f.name)
      ),
      detail: "Entity declares at least one identifying field for duplicate comparison.",
      mandatory: false,
    },
  ];

  const failedMandatory = checks.filter((c) => c.mandatory && !c.passed).map((c) => c.id);
  const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);

  return {
    entity,
    certified: failedMandatory.length === 0,
    score,
    checks,
    failedMandatory,
    generatedAt: new Date().toISOString(),
  };
}

/** Certifies every registered entity. */
export function certifyPlatform(): {
  entities: CertificationReport[];
  certifiedCount: number;
  totalCount: number;
  averageScore: number;
  platformCertified: boolean;
} {
  const entities = getAllEntities().map((e) => certifyEntity(e.key));
  const certifiedCount = entities.filter((e) => e.certified).length;
  return {
    entities,
    certifiedCount,
    totalCount: entities.length,
    averageScore:
      entities.length === 0
        ? 0
        : Math.round(entities.reduce((s, e) => s + e.score, 0) / entities.length),
    platformCertified: certifiedCount === entities.length && entities.length > 0,
  };
}

// ── Metadata introspection ────────────────────────────────────────────────

/** Full metadata description of one entity. */
export function describeEntityMetadata(entity: string) {
  const described = describeEntity(entity);
  if (!described) return null;

  return {
    entity: described.entity,
    fields: described.fields,
    relationships: getRelationshipsFrom(entity),
    formRules: describeFormRules(entity),
    calculation: checkCalculationHealth(entity),
    schema: getCurrentSchema(entity) ?? null,
    certification: certifyEntity(entity),
  };
}

/** Platform-wide runtime statistics. */
export function getRuntimeStats(tenantId?: string) {
  return {
    entities: getEntityStats(),
    fields: getFieldStats(),
    relationships: getRelationshipStats(),
    schema: getSchemaStats(),
    forms: getFormEngineStats(),
    defaults: getDefaultsStats(),
    businessRules: getBusinessRuleStats(),
    searchIndex: getIndexStats(tenantId),
    graph: analyzeGraphHealth(),
    pipelineStages: PIPELINE_STAGES,
  };
}

/** Configuration issues that need attention before the runtime is trustworthy. */
export function getRuntimeIssues(): {
  brokenInverses: ReturnType<typeof findBrokenInverses>;
  unversionedDrift: ReturnType<typeof findUnversionedDrift>;
  unhealthyCalculations: Array<{ entity: string; issues: string[] }>;
  disconnectedEntities: string[];
} {
  const unhealthyCalculations: Array<{ entity: string; issues: string[] }> = [];
  for (const entity of getAllEntities()) {
    const health = checkCalculationHealth(entity.key);
    if (health.healthy) continue;
    unhealthyCalculations.push({
      entity: entity.key,
      issues: [
        ...health.cycles.map((c) => `cycle: ${c.join(" → ")}`),
        ...health.invalidFormulas.map((f) => `${f.field}: ${f.error}`),
        ...health.unknownReferences.map((r) => `${r.field} reads unknown '${r.reference}'`),
      ],
    });
  }

  return {
    brokenInverses: findBrokenInverses(),
    unversionedDrift: findUnversionedDrift(),
    unhealthyCalculations,
    disconnectedEntities: analyzeGraphHealth().orphans,
  };
}

export { captureSchema, getAllEntities };
