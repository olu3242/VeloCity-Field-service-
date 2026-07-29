/**
 * IDXF Integration — Enforcement Gate.
 *
 * The final step of the shadow rollout: turning IDXF validation from an
 * observation into a real gate, per entity.
 *
 * Enabling enforcement is deliberately hard to do by accident. It requires the
 * adoption evidence to support it — enough observations, high agreement, no
 * unexplained strictness — because switching it on prematurely rejects writes
 * the platform currently accepts. The override exists for cases where a
 * divergence is understood and accepted, but it must be stated explicitly and
 * is recorded with a reason.
 *
 * Default for every entity is `observe`. Nothing enforces until someone decides
 * it should.
 */

import "@/lib/metadata";

import { getEntity } from "@/lib/metadata/entity-registry";
import { validateRecord, type ValidationResult, type ValidationStage } from "@/lib/validation/validation-engine";
import { getAdoptionReport, shadowValidate } from "./shadow-validator";
import { logger } from "@/lib/logger";

export type EnforcementMode =
  /** Record the comparison, never block. The default. */
  | "observe"
  /** Block on IDXF validation errors. */
  | "enforce";

export interface EnforcementConfig {
  entity: string;
  mode: EnforcementMode;
  /** Who enabled it and why — enforcement changes behaviour, so it is attributable. */
  changedBy: string;
  reason: string;
  /** True when enabled despite the adoption report advising against it. */
  overrodeReadiness: boolean;
  /** Adoption figures at the moment enforcement was enabled. */
  evidenceAtEnable: {
    observations: number;
    agreementRate: number;
    divergentFields: string[];
  } | null;
  changedAt: string;
}

const CONFIG: Map<string, EnforcementConfig> = new Map();

export function getEnforcementMode(entity: string): EnforcementMode {
  return CONFIG.get(entity)?.mode ?? "observe";
}

export function getEnforcementConfig(entity: string): EnforcementConfig | undefined {
  return CONFIG.get(entity);
}

export function getAllEnforcementConfigs(): EnforcementConfig[] {
  return Array.from(CONFIG.values()).sort((a, b) => a.entity.localeCompare(b.entity));
}

export interface SetModeResult {
  ok: boolean;
  config?: EnforcementConfig;
  error?: string;
  /** Blockers reported by the adoption report, when readiness was the obstacle. */
  blockers?: string[];
}

/**
 * Sets an entity's enforcement mode.
 *
 * Enabling enforcement is refused unless the adoption report says the evidence
 * supports it, or `override` is explicitly set. Disabling is always allowed —
 * turning a gate off can never break a write that was previously accepted.
 */
export function setEnforcementMode(
  entity: string,
  mode: EnforcementMode,
  options: { changedBy: string; reason: string; override?: boolean; tenantId?: string }
): SetModeResult {
  if (!getEntity(entity)) {
    return { ok: false, error: `Unknown entity '${entity}'` };
  }
  if (!options.reason || options.reason.trim() === "") {
    return { ok: false, error: "A reason is required — enforcement changes write behaviour." };
  }

  // Adoption evidence is platform-wide: enforcement applies to every tenant, so
  // one tenant's clean record is not sufficient grounds.
  const report = getAdoptionReport(entity);

  if (mode === "enforce" && !report.readyToEnforce && options.override !== true) {
    return {
      ok: false,
      error:
        "Adoption evidence does not support enforcement. Resolve the blockers, or set override: true to proceed deliberately.",
      blockers: report.blockers,
    };
  }

  const config: EnforcementConfig = {
    entity,
    mode,
    changedBy: options.changedBy,
    reason: options.reason,
    overrodeReadiness: mode === "enforce" && !report.readyToEnforce,
    evidenceAtEnable:
      mode === "enforce"
        ? {
            observations: report.observations,
            agreementRate: report.agreementRate,
            divergentFields: report.divergentFields.map((d) => d.field),
          }
        : null,
    changedAt: new Date().toISOString(),
  };

  CONFIG.set(entity, config);

  logger.warn("idxf.enforcement.changed", {
    entity,
    mode,
    changedBy: options.changedBy,
    overrodeReadiness: config.overrodeReadiness,
    reason: options.reason,
  });

  return { ok: true, config };
}

export interface GateResult {
  /** Whether the write may proceed. */
  allowed: boolean;
  mode: EnforcementMode;
  /** Populated when validation ran. */
  validation: ValidationResult | null;
  /**
   * True when IDXF found errors but the entity is in observe mode, so the write
   * proceeds anyway. This is the case that would have been blocked under
   * enforcement — worth surfacing in telemetry.
   */
  wouldBlockUnderEnforcement: boolean;
  entity: string;
}

/**
 * The call a write path makes instead of `observe()` once enforcement is
 * available for an entity.
 *
 * In observe mode this behaves exactly like the shadow validator: it records the
 * comparison and always allows. In enforce mode it blocks on IDXF errors.
 *
 * A fault inside the gate always allows the write. Failing open is the correct
 * bias here: a bug in the validation layer must not take down job creation.
 */
export function gate(
  entity: string,
  payload: Record<string, unknown>,
  context: {
    tenantId: string;
    legacyAccepted: boolean;
    source: string;
    stage?: ValidationStage;
  }
): GateResult {
  const mode = getEnforcementMode(entity);

  try {
    const observation = shadowValidate(entity, payload, {
      tenantId: context.tenantId,
      legacyAccepted: context.legacyAccepted,
      source: context.source,
      ...(context.stage ? { stage: context.stage } : {}),
    });

    // A shadow error means the comparison itself failed; that is not evidence
    // the payload is bad, so it must never block.
    if (observation.verdict === "shadow_error") {
      return {
        allowed: true,
        mode,
        validation: null,
        wouldBlockUnderEnforcement: false,
        entity,
      };
    }

    if (mode === "observe") {
      return {
        allowed: true,
        mode,
        validation: null,
        wouldBlockUnderEnforcement: !observation.idxfAccepted,
        entity,
      };
    }

    // Enforcing: re-run to obtain the full result for the error response.
    const validation = validateRecord(entity, payload, {
      ...(context.stage ? { stage: context.stage } : {}),
      skipAI: true,
    });

    if (!validation.valid) {
      logger.warn("idxf.enforcement.blocked", {
        entity,
        source: context.source,
        errors: validation.errors.map((e) => `${e.field}:${e.code}`),
      });
    }

    return {
      allowed: validation.valid,
      mode,
      validation,
      wouldBlockUnderEnforcement: !validation.valid,
      entity,
    };
  } catch (err) {
    // Fail open — a fault in the validation layer must not break the write path.
    logger.error("idxf.enforcement.gate_error", {
      entity,
      source: context.source,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      allowed: true,
      mode,
      validation: null,
      wouldBlockUnderEnforcement: false,
      entity,
    };
  }
}

/** Enforcement posture across the platform, for the adoption dashboard. */
export function getEnforcementPosture(): {
  enforcing: string[];
  observing: string[];
  overridden: Array<{ entity: string; reason: string; changedBy: string }>;
  readyButNotEnforcing: string[];
} {
  const configs = getAllEnforcementConfigs();
  const enforcing = configs.filter((c) => c.mode === "enforce").map((c) => c.entity);

  // Entities whose evidence supports enforcement but which are still observing —
  // the actionable list.
  const readyButNotEnforcing: string[] = [];
  for (const config of configs) {
    if (config.mode === "enforce") continue;
    if (getAdoptionReport(config.entity).readyToEnforce) readyButNotEnforcing.push(config.entity);
  }

  return {
    enforcing,
    observing: configs.filter((c) => c.mode === "observe").map((c) => c.entity),
    overridden: configs
      .filter((c) => c.overrodeReadiness && c.mode === "enforce")
      .map((c) => ({ entity: c.entity, reason: c.reason, changedBy: c.changedBy })),
    readyButNotEnforcing,
  };
}

/** Resets an entity to the default observe mode. */
export function resetEnforcement(entity: string): boolean {
  return CONFIG.delete(entity);
}
