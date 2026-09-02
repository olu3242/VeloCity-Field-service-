/**
 * IDXF Engine 85 — Smart Defaults Engine.
 *
 * Populates fields from history, location, tenant policy and organisation rules
 * before the user types anything: nearest territory, preferred provider, last
 * used address, membership tier, tax profile.
 *
 * Rules are registered by id and referenced from field metadata (`defaultRule`),
 * so which field gets which default is metadata, not form code.
 */

// Bootstraps the entity, field and relationship registries. Importing the
// sub-registries alone leaves them empty, so whichever module the bundler
// happens to load first would read an unpopulated registry — crashing at
// import time here, or silently returning empty results elsewhere.
import "@/lib/metadata";

import { getEntityFields, getField } from "@/lib/metadata/field-engine";

export type DefaultSource =
  | "history"
  | "location"
  | "tenant_policy"
  | "organisation_rule"
  | "ai_inference"
  | "static";

/** Context a default rule may read. Everything is optional and tenant-scoped. */
export interface DefaultContext {
  tenantId: string;
  userId?: string;
  /** The partially-filled record being created. */
  record: Record<string, unknown>;
  /** Prior rows for this user/tenant, most recent first. */
  history?: Array<Record<string, unknown>>;
  /** Current location, when the client supplied one. */
  location?: { latitude: number; longitude: number };
  /** Tenant-level configuration, e.g. default tax profile. */
  tenantPolicy?: Record<string, unknown>;
  now?: Date;
}

export interface DefaultResolution {
  field: string;
  value: unknown;
  source: DefaultSource;
  /** How much to trust this default, 0–1. */
  confidence: number;
  reason: string;
}

export interface DefaultRule {
  id: string;
  label: string;
  source: DefaultSource;
  description: string;
  /**
   * Returns a value, or null when the rule cannot conclude.
   * Returning null is normal — a default that cannot be inferred must not
   * fabricate one.
   */
  resolve: (ctx: DefaultContext) => { value: unknown; confidence: number; reason: string } | null;
}

const RULES: Map<string, DefaultRule> = new Map();

export function registerDefaultRule(rule: DefaultRule): DefaultRule {
  if (!rule.id || rule.id.trim() === "") {
    throw new Error("[IDXF/smart-defaults] rule id is required");
  }
  RULES.set(rule.id, rule);
  return rule;
}

export function getDefaultRule(id: string): DefaultRule | undefined {
  return RULES.get(id);
}

export function getAllDefaultRules(): DefaultRule[] {
  return Array.from(RULES.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Most frequent non-empty value for a field across history. */
function mostFrequent(
  history: Array<Record<string, unknown>>,
  field: string
): { value: unknown; count: number; total: number } | null {
  const counts = new Map<string, { value: unknown; count: number }>();
  let total = 0;

  for (const row of history) {
    const value = row[field];
    if (value === null || value === undefined || value === "") continue;
    total += 1;
    const key = String(value);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { value, count: 1 });
  }

  if (total === 0) return null;
  let best: { value: unknown; count: number } | null = null;
  for (const entry of Array.from(counts.values())) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? { value: best.value, count: best.count, total } : null;
}

// ── Pre-registered platform rules ─────────────────────────────────────────

registerDefaultRule({
  id: "preferred_provider",
  label: "Preferred provider",
  source: "history",
  description: "The provider this customer has used most often.",
  resolve: (ctx) => {
    if (!ctx.history || ctx.history.length === 0) return null;
    const best = mostFrequent(ctx.history, "provider_id");
    if (!best) return null;
    // A single prior job is weak evidence of a preference; confidence scales
    // with how dominant the choice is and how much history backs it.
    const share = best.count / best.total;
    const volume = Math.min(1, best.total / 5);
    const confidence = Number((share * 0.7 + volume * 0.3).toFixed(2));
    if (confidence < 0.3) return null;
    return {
      value: best.value,
      confidence,
      reason: `Used in ${best.count} of the last ${best.total} jobs.`,
    };
  },
});

registerDefaultRule({
  id: "previous_address",
  label: "Previous address",
  source: "history",
  description: "The address used on the most recent job.",
  resolve: (ctx) => {
    if (!ctx.history || ctx.history.length === 0) return null;
    const latest = ctx.history[0];
    if (!latest) return null;
    const value = latest.address_id ?? latest.street;
    if (value === null || value === undefined || value === "") return null;
    return { value, confidence: 0.8, reason: "Address from the most recent job." };
  },
});

registerDefaultRule({
  id: "nearest_territory",
  label: "Nearest territory",
  source: "location",
  description: "The service area closest to the supplied coordinates.",
  resolve: (ctx) => {
    if (!ctx.location) return null;
    const territories = ctx.tenantPolicy?.territories;
    if (!Array.isArray(territories) || territories.length === 0) return null;

    let best: { id: unknown; distance: number } | null = null;
    for (const raw of territories) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Record<string, unknown>;
      const lat = typeof t.latitude === "number" ? t.latitude : null;
      const lon = typeof t.longitude === "number" ? t.longitude : null;
      if (lat === null || lon === null) continue;
      const distance = haversineKm(ctx.location.latitude, ctx.location.longitude, lat, lon);
      if (!best || distance < best.distance) best = { id: t.id, distance };
    }

    if (!best) return null;
    // Beyond 200 km "nearest" stops meaning "serving this location".
    if (best.distance > 200) return null;
    return {
      value: best.id,
      confidence: Number(Math.max(0.4, 1 - best.distance / 200).toFixed(2)),
      reason: `Closest service area, ${best.distance.toFixed(1)} km away.`,
    };
  },
});

registerDefaultRule({
  id: "membership_tier",
  label: "Membership tier",
  source: "tenant_policy",
  description: "The tenant's default membership tier for new customers.",
  resolve: (ctx) => {
    const tier = ctx.tenantPolicy?.defaultMembershipTier;
    if (typeof tier !== "string" || tier === "") return null;
    return { value: tier, confidence: 1, reason: "Tenant default membership tier." };
  },
});

registerDefaultRule({
  id: "tax_profile",
  label: "Tax profile",
  source: "tenant_policy",
  description: "The tenant's configured tax profile.",
  resolve: (ctx) => {
    const profile = ctx.tenantPolicy?.taxProfile;
    if (typeof profile !== "string" || profile === "") return null;
    return { value: profile, confidence: 1, reason: "Tenant tax profile." };
  },
});

registerDefaultRule({
  id: "next_available_slot",
  label: "Next available slot",
  source: "organisation_rule",
  description: "The next business-hours slot, at least two hours out.",
  resolve: (ctx) => {
    const now = ctx.now ?? new Date();
    const slot = new Date(now.getTime() + 2 * 3_600_000);
    // Push outside business hours forward to the next 09:00 rather than
    // proposing a 03:00 appointment.
    const hour = slot.getUTCHours();
    if (hour >= 17) {
      slot.setUTCDate(slot.getUTCDate() + 1);
      slot.setUTCHours(9, 0, 0, 0);
    } else if (hour < 9) {
      slot.setUTCHours(9, 0, 0, 0);
    }
    return {
      value: slot.toISOString(),
      confidence: 0.6,
      reason: "Next business-hours slot at least two hours from now.",
    };
  },
});

registerDefaultRule({
  id: "membership_next_service",
  label: "Next service date",
  source: "organisation_rule",
  description: "One billing interval from today.",
  resolve: (ctx) => {
    const now = ctx.now ?? new Date();
    const interval = ctx.record.interval;
    const days = interval === "year" ? 365 : interval === "week" ? 7 : 30;
    return {
      value: new Date(now.getTime() + days * 86_400_000).toISOString(),
      confidence: 0.75,
      reason: `One ${String(interval ?? "month")} from today.`,
    };
  },
});

registerDefaultRule({
  id: "preferred_payment",
  label: "Preferred payment method",
  source: "history",
  description: "The payment type used most often by this customer.",
  resolve: (ctx) => {
    if (!ctx.history || ctx.history.length === 0) return null;
    const best = mostFrequent(ctx.history, "type");
    if (!best || best.count < 2) return null;
    return {
      value: best.value,
      confidence: Number(Math.min(0.9, best.count / best.total).toFixed(2)),
      reason: `Used in ${best.count} of ${best.total} prior payments.`,
    };
  },
});

export interface DefaultsResult {
  entity: string;
  /** Field → resolved default. Only fields that were empty are included. */
  defaults: DefaultResolution[];
  /** The record with defaults applied. */
  record: Record<string, unknown>;
  /** Rules referenced in metadata that are not registered. */
  missingRules: string[];
  appliedAt: string;
}

/**
 * Resolves defaults for every empty field whose metadata names a default rule.
 *
 * Fields the user already filled are never overwritten — a default is a starting
 * point, not a correction.
 */
export function resolveDefaults(
  entity: string,
  context: DefaultContext,
  options: { minConfidence?: number } = {}
): DefaultsResult {
  const minConfidence = options.minConfidence ?? 0;
  const defaults: DefaultResolution[] = [];
  const missingRules: string[] = [];
  const record = { ...context.record };

  for (const field of getEntityFields(entity)) {
    if (!field.defaultRule) continue;
    // Calculated fields are produced by the calculation engine.
    if (field.readOnly) continue;

    const existing = record[field.name];
    const empty = existing === null || existing === undefined || existing === "";
    if (!empty) continue;

    const rule = RULES.get(field.defaultRule);
    if (!rule) {
      // A metadata reference to a rule that does not exist would leave the field
      // silently blank while appearing to have a default configured.
      missingRules.push(field.defaultRule);
      continue;
    }

    const resolved = rule.resolve({ ...context, record });
    if (!resolved) continue;
    if (resolved.confidence < minConfidence) continue;

    defaults.push({
      field: field.name,
      value: resolved.value,
      source: rule.source,
      confidence: resolved.confidence,
      reason: resolved.reason,
    });
    record[field.name] = resolved.value;
  }

  return {
    entity,
    defaults,
    record,
    missingRules: Array.from(new Set(missingRules)),
    appliedAt: new Date().toISOString(),
  };
}

/** Resolves the default for one field explicitly. */
export function resolveFieldDefault(
  entity: string,
  fieldName: string,
  context: DefaultContext
): DefaultResolution | null {
  const field = getField(entity, fieldName);
  if (!field?.defaultRule) return null;
  const rule = RULES.get(field.defaultRule);
  if (!rule) return null;
  const resolved = rule.resolve(context);
  if (!resolved) return null;
  return {
    field: fieldName,
    value: resolved.value,
    source: rule.source,
    confidence: resolved.confidence,
    reason: resolved.reason,
  };
}

export function getDefaultsStats(): { rules: number; bySource: Record<string, number> } {
  const bySource: Record<string, number> = {};
  for (const rule of Array.from(RULES.values())) {
    bySource[rule.source] = (bySource[rule.source] ?? 0) + 1;
  }
  return { rules: RULES.size, bySource };
}
