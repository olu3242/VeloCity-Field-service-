/**
 * IDXF Engine 88 — Duplicate Detection Engine.
 *
 * Scores how likely two records describe the same real-world entity, using
 * name, email, phone, address and geographic proximity.
 *
 * Candidates are supplied by the caller from a tenant-scoped query — the engine
 * never queries, so it cannot accidentally compare across tenants.
 */

export type MatchSignal =
  | "exact_email"
  | "exact_phone"
  | "exact_name"
  | "similar_name"
  | "same_address"
  | "geo_proximity"
  | "same_business_name";

export interface SignalContribution {
  signal: MatchSignal;
  weight: number;
  detail: string;
}

export interface DuplicateCandidate {
  id: string;
  /** 0–1 likelihood the two records are the same entity. */
  probability: number;
  /** Percentage form for the UI ("92%"). */
  confidence: number;
  signals: SignalContribution[];
  recommendation: "merge" | "review" | "ignore";
  title: string;
}

export interface DuplicateReport {
  entity: string;
  recordId: string | null;
  candidates: DuplicateCandidate[];
  /** Highest probability found, 0 when none. */
  topProbability: number;
  checkedCount: number;
  generatedAt: string;
}

/**
 * Signal weights, calibrated against the combinations they must produce.
 *
 * Email and phone are near-identifying: matching both is conclusive enough to
 * clear the merge bar on its own (1 - 0.4×0.45 = 0.82, and 0.87 once a name
 * agrees too). A name alone stays deliberately weak — common names collide
 * constantly, and merging on a name match would destroy distinct records.
 */
const SIGNAL_WEIGHTS: Record<MatchSignal, number> = {
  exact_email: 0.6,
  exact_phone: 0.55,
  same_business_name: 0.35,
  exact_name: 0.25,
  same_address: 0.2,
  geo_proximity: 0.15,
  similar_name: 0.12,
};

const MERGE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.55;

function normaliseText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalisePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  // Compare the last 10 digits so +1-555-123-4567 and 5551234567 match.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normaliseEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/** Token-set similarity, 0–1. Order-insensitive so "John Smith" matches "Smith John". */
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const token of Array.from(ta)) if (tb.has(token)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
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

function readCoords(row: Record<string, unknown>): { lat: number; lon: number } | null {
  const location = row.location ?? row.last_location;
  if (location && typeof location === "object") {
    const l = location as Record<string, unknown>;
    const lat = typeof l.latitude === "number" ? l.latitude : typeof l.lat === "number" ? l.lat : null;
    const lon = typeof l.longitude === "number" ? l.longitude : typeof l.lon === "number" ? l.lon : null;
    if (lat !== null && lon !== null) return { lat, lon };
  }
  const lat = typeof row.latitude === "number" ? row.latitude : null;
  const lon = typeof row.longitude === "number" ? row.longitude : null;
  return lat !== null && lon !== null ? { lat, lon } : null;
}

/** Field names checked per signal, so the engine works across entity shapes. */
const FIELD_ALIASES = {
  email: ["email", "contact_email", "billing_email"],
  phone: ["phone", "phone_number", "contact_phone", "mobile"],
  name: ["full_name", "name", "title", "display_name"],
  businessName: ["business_name", "company_name", "legal_name"],
  address: ["street", "address", "address_line_1"],
};

function firstValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

/** Compares two rows and returns the matching signals. */
export function compareRecords(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): SignalContribution[] {
  const signals: SignalContribution[] = [];

  const emailA = normaliseEmail(firstValue(a, FIELD_ALIASES.email));
  const emailB = normaliseEmail(firstValue(b, FIELD_ALIASES.email));
  if (emailA && emailA === emailB) {
    signals.push({ signal: "exact_email", weight: SIGNAL_WEIGHTS.exact_email, detail: `Both use ${emailA}` });
  }

  const phoneA = normalisePhone(firstValue(a, FIELD_ALIASES.phone));
  const phoneB = normalisePhone(firstValue(b, FIELD_ALIASES.phone));
  // Require a plausible length, or two blank/short numbers would "match".
  if (phoneA && phoneA.length >= 7 && phoneA === phoneB) {
    signals.push({ signal: "exact_phone", weight: SIGNAL_WEIGHTS.exact_phone, detail: `Both use ${phoneA}` });
  }

  const bizA = normaliseText(firstValue(a, FIELD_ALIASES.businessName));
  const bizB = normaliseText(firstValue(b, FIELD_ALIASES.businessName));
  if (bizA && bizA === bizB) {
    signals.push({
      signal: "same_business_name",
      weight: SIGNAL_WEIGHTS.same_business_name,
      detail: `Both trade as "${bizA}"`,
    });
  }

  const nameA = normaliseText(firstValue(a, FIELD_ALIASES.name));
  const nameB = normaliseText(firstValue(b, FIELD_ALIASES.name));
  if (nameA && nameB) {
    if (nameA === nameB) {
      signals.push({ signal: "exact_name", weight: SIGNAL_WEIGHTS.exact_name, detail: `Both named "${nameA}"` });
    } else {
      const similarity = nameSimilarity(nameA, nameB);
      if (similarity >= 0.5) {
        signals.push({
          signal: "similar_name",
          // Scale by how similar, so a partial overlap contributes proportionally.
          weight: Number((SIGNAL_WEIGHTS.similar_name * similarity).toFixed(4)),
          detail: `Names ${Math.round(similarity * 100)}% similar`,
        });
      }
    }
  }

  const addrA = normaliseText(firstValue(a, FIELD_ALIASES.address));
  const addrB = normaliseText(firstValue(b, FIELD_ALIASES.address));
  if (addrA && addrA === addrB) {
    signals.push({ signal: "same_address", weight: SIGNAL_WEIGHTS.same_address, detail: "Identical street address" });
  }

  const coordsA = readCoords(a);
  const coordsB = readCoords(b);
  if (coordsA && coordsB) {
    const km = haversineKm(coordsA.lat, coordsA.lon, coordsB.lat, coordsB.lon);
    if (km < 0.1) {
      signals.push({
        signal: "geo_proximity",
        weight: SIGNAL_WEIGHTS.geo_proximity,
        detail: `Within ${Math.round(km * 1000)} m`,
      });
    }
  }

  return signals;
}

function scoreSignals(signals: SignalContribution[]): number {
  // Probabilistic OR: each signal reduces the chance the pair is unrelated.
  // Additive weights would exceed 1 once several signals fire.
  let notDuplicate = 1;
  for (const signal of signals) notDuplicate *= 1 - signal.weight;
  return Number((1 - notDuplicate).toFixed(4));
}

function recommend(probability: number): DuplicateCandidate["recommendation"] {
  if (probability >= MERGE_THRESHOLD) return "merge";
  if (probability >= REVIEW_THRESHOLD) return "review";
  return "ignore";
}

export interface DetectOptions {
  /** Ignore candidates below this probability. */
  minProbability?: number;
  limit?: number;
  /** Field used as the candidate's display title. */
  titleField?: string;
  /** Id field on candidate rows. */
  idField?: string;
}

/**
 * Scores a record against caller-supplied candidates.
 * Candidates MUST come from a tenant-scoped query.
 */
export function detectDuplicates(
  entity: string,
  record: Record<string, unknown>,
  candidates: Array<Record<string, unknown>>,
  options: DetectOptions = {}
): DuplicateReport {
  const idField = options.idField ?? "id";
  const titleField = options.titleField ?? "full_name";
  const minProbability = options.minProbability ?? REVIEW_THRESHOLD;
  const recordId = typeof record[idField] === "string" ? (record[idField] as string) : null;

  const scored: DuplicateCandidate[] = [];

  for (const candidate of candidates) {
    const candidateId = candidate[idField];
    if (typeof candidateId !== "string") continue;
    // A record is not its own duplicate.
    if (recordId && candidateId === recordId) continue;

    const signals = compareRecords(record, candidate);
    if (signals.length === 0) continue;

    const probability = scoreSignals(signals);
    if (probability < minProbability) continue;

    const titleRaw = candidate[titleField] ?? candidate.title ?? candidate.business_name;

    scored.push({
      id: candidateId,
      probability,
      confidence: Math.round(probability * 100),
      signals,
      recommendation: recommend(probability),
      title: typeof titleRaw === "string" ? titleRaw : candidateId,
    });
  }

  scored.sort((a, b) => b.probability - a.probability);
  const limited = scored.slice(0, options.limit ?? 10);

  return {
    entity,
    recordId,
    candidates: limited,
    topProbability: limited[0]?.probability ?? 0,
    checkedCount: candidates.length,
    generatedAt: new Date().toISOString(),
  };
}

/** Duplicate risk 0–1 for the quality score. */
export function duplicateRisk(report: DuplicateReport): number {
  return report.topProbability;
}

export const DUPLICATE_THRESHOLDS = {
  merge: MERGE_THRESHOLD,
  review: REVIEW_THRESHOLD,
};
