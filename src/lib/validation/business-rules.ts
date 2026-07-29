/**
 * IDXF Engine 79 — Business Rules.
 *
 * Named, reusable predicates that fields reference by id in their metadata
 * (`validation.businessRules`). Rules are pure functions over a record so they
 * are deterministic and testable; anything needing a database lookup belongs in
 * cross-record.ts, which takes an explicit resolver.
 */

export type RuleSeverity = "error" | "warning" | "suggestion";

export interface RuleOutcome {
  passed: boolean;
  severity: RuleSeverity;
  message: string;
  /** Machine-actionable fix the AI assistant or UI can apply. */
  autoFix?: { field: string; value: unknown; description: string };
}

export interface BusinessRule {
  id: string;
  label: string;
  description: string;
  /** Fields this rule reads — used to decide when to re-run it. */
  reads: string[];
  severity: RuleSeverity;
  evaluate: (record: Record<string, unknown>) => RuleOutcome;
}

const RULES: Map<string, BusinessRule> = new Map();

export function registerBusinessRule(rule: BusinessRule): BusinessRule {
  if (!rule.id || rule.id.trim() === "") {
    throw new Error("[IDXF/business-rules] rule id is required");
  }
  RULES.set(rule.id, rule);
  return rule;
}

export function getBusinessRule(id: string): BusinessRule | undefined {
  return RULES.get(id);
}

export function getAllBusinessRules(): BusinessRule[] {
  return Array.from(RULES.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** Rules that read a given field — the set to re-run when it changes. */
export function getRulesReading(field: string): BusinessRule[] {
  return getAllBusinessRules().filter((r) => r.reads.includes(field));
}

function pass(severity: RuleSeverity, message: string): RuleOutcome {
  return { passed: true, severity, message };
}

function fail(
  severity: RuleSeverity,
  message: string,
  autoFix?: RuleOutcome["autoFix"]
): RuleOutcome {
  return { passed: false, severity, message, ...(autoFix ? { autoFix } : {}) };
}

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = new Date(typeof value === "number" ? value : String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ── Pre-registered platform rules ─────────────────────────────────────────

registerBusinessRule({
  id: "end_after_start",
  label: "End after start",
  description: "A scheduled window must end after it begins.",
  reads: ["scheduled_start", "scheduled_end"],
  severity: "error",
  evaluate: (record) => {
    const start = asDate(record.scheduled_start);
    const end = asDate(record.scheduled_end);
    // Absent values are the required-check's business, not this rule's.
    if (!start || !end) return pass("error", "No window to compare.");
    if (end.getTime() > start.getTime()) return pass("error", "Window is valid.");
    return fail(
      "error",
      `Scheduled end (${end.toISOString()}) is not after start (${start.toISOString()}).`,
      {
        field: "scheduled_end",
        value: new Date(start.getTime() + 3_600_000).toISOString(),
        description: "Set end to one hour after start.",
      }
    );
  },
});

registerBusinessRule({
  id: "insurance_not_expired",
  label: "Insurance current",
  description: "A provider's insurance must not be past its expiry date.",
  reads: ["insurance_expiry"],
  severity: "error",
  evaluate: (record) => {
    const expiry = asDate(record.insurance_expiry);
    if (!expiry) return { passed: false, severity: "warning", message: "No insurance expiry recorded." };
    if (expiry.getTime() > Date.now()) {
      const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
      // Expiring soon is a warning, not a hard failure — the provider is still
      // dispatchable today but needs attention before the date passes.
      if (daysLeft <= 30) {
        return { passed: false, severity: "warning", message: `Insurance expires in ${daysLeft} day(s).` };
      }
      return pass("error", "Insurance is current.");
    }
    return fail("error", `Insurance expired on ${expiry.toISOString().slice(0, 10)}.`);
  },
});

registerBusinessRule({
  id: "provider_active",
  label: "Provider active",
  description: "Work may only be assigned to a provider in an active state.",
  reads: ["status"],
  severity: "error",
  evaluate: (record) => {
    const status = typeof record.status === "string" ? record.status : null;
    if (!status) return pass("error", "No provider status to check.");
    if (["active", "approved", "verified"].includes(status)) return pass("error", "Provider is active.");
    return fail("error", `Provider status '${status}' is not dispatchable.`);
  },
});

registerBusinessRule({
  id: "payout_not_exceeding_payment",
  label: "Payout within payment",
  description: "A provider payout may not exceed the amount collected.",
  reads: ["amount_cents", "provider_payout_cents", "platform_fee_cents"],
  severity: "error",
  evaluate: (record) => {
    const amount = asNumber(record.amount_cents);
    const payout = asNumber(record.provider_payout_cents);
    if (amount === null || payout === null) return pass("error", "Nothing to compare.");
    if (payout <= amount) return pass("error", "Payout is within the collected amount.");
    return fail(
      "error",
      `Payout (${payout}) exceeds collected amount (${amount}).`,
      {
        field: "provider_payout_cents",
        value: amount - (asNumber(record.platform_fee_cents) ?? 0),
        description: "Reduce payout to amount less platform fee.",
      }
    );
  },
});

registerBusinessRule({
  id: "final_cost_within_quote_tolerance",
  label: "Final cost near quote",
  description: "A final cost more than 25% above the quote should be reviewed.",
  reads: ["quoted_cost_cents", "final_cost_cents"],
  severity: "warning",
  evaluate: (record) => {
    const quoted = asNumber(record.quoted_cost_cents);
    const final = asNumber(record.final_cost_cents);
    if (quoted === null || final === null || quoted === 0) {
      return pass("warning", "No quote to compare against.");
    }
    const variance = (final - quoted) / quoted;
    if (variance <= 0.25) return pass("warning", "Final cost is within tolerance.");
    return {
      passed: false,
      severity: "warning",
      message: `Final cost is ${(variance * 100).toFixed(1)}% above the quote — change order review recommended.`,
    };
  },
});

registerBusinessRule({
  id: "deposit_not_exceeding_total",
  label: "Deposit within total",
  description: "A deposit may not exceed the job's final cost.",
  reads: ["deposit_amount_cents", "final_cost_cents"],
  severity: "error",
  evaluate: (record) => {
    const deposit = asNumber(record.deposit_amount_cents);
    const total = asNumber(record.final_cost_cents);
    if (deposit === null || total === null || total === 0) return pass("error", "Nothing to compare.");
    if (deposit <= total) return pass("error", "Deposit is within the total.");
    return fail("error", `Deposit (${deposit}) exceeds final cost (${total}).`, {
      field: "deposit_amount_cents",
      value: total,
      description: "Cap the deposit at the final cost.",
    });
  },
});

registerBusinessRule({
  id: "rating_requires_completed_job",
  label: "Rating needs completed work",
  description: "A review should only exist against work that reached completion.",
  reads: ["rating", "status"],
  severity: "suggestion",
  evaluate: (record) => {
    const rating = asNumber(record.rating);
    if (rating === null) return pass("suggestion", "No rating present.");
    const status = typeof record.status === "string" ? record.status : null;
    if (status === null || status === "completed") return pass("suggestion", "Review context is valid.");
    return {
      passed: false,
      severity: "suggestion",
      message: `Review recorded against a job in '${status}' state rather than 'completed'.`,
    };
  },
});

registerBusinessRule({
  id: "quote_not_expired",
  label: "Quote still valid",
  description: "A quote should not be acted on after its validity date.",
  reads: ["valid_until", "approved_at"],
  severity: "warning",
  evaluate: (record) => {
    const validUntil = asDate(record.valid_until);
    if (!validUntil) return pass("warning", "No validity date set.");
    // An already-approved quote is historical; expiry no longer matters.
    if (record.approved_at) return pass("warning", "Quote already approved.");
    if (validUntil.getTime() > Date.now()) return pass("warning", "Quote is still valid.");
    return {
      passed: false,
      severity: "warning",
      message: `Quote expired on ${validUntil.toISOString().slice(0, 10)}.`,
    };
  },
});

registerBusinessRule({
  id: "offer_expiry_after_offered",
  label: "Offer window is coherent",
  description: "An offer must expire after it was made.",
  reads: ["offered_at", "expires_at"],
  severity: "error",
  evaluate: (record) => {
    const offered = asDate(record.offered_at);
    const expires = asDate(record.expires_at);
    if (!offered || !expires) return pass("error", "No offer window to compare.");
    if (expires.getTime() > offered.getTime()) return pass("error", "Offer window is valid.");
    return fail(
      "error",
      `Offer expires at ${expires.toISOString()}, which is not after it was offered (${offered.toISOString()}).`,
      {
        field: "expires_at",
        value: new Date(offered.getTime() + 1_800_000).toISOString(),
        description: "Set expiry to 30 minutes after the offer was made.",
      }
    );
  },
});

registerBusinessRule({
  id: "read_after_sent",
  label: "Read timestamp is coherent",
  description: "A notification cannot be read before it was sent.",
  reads: ["sent_at", "read_at"],
  severity: "error",
  evaluate: (record) => {
    const sent = asDate(record.sent_at);
    const read = asDate(record.read_at);
    // An unread notification is the normal case, not a failure.
    if (!read) return pass("error", "Notification has not been read.");
    if (!sent) return { passed: false, severity: "warning", message: "Notification is marked read but has no sent timestamp." };
    if (read.getTime() >= sent.getTime()) return pass("error", "Read timestamp is coherent.");
    return fail("error", `Read at ${read.toISOString()} is before it was sent at ${sent.toISOString()}.`);
  },
});

/** Runs a named set of rules against a record. Unknown ids are reported. */
export function evaluateRules(
  ruleIds: string[],
  record: Record<string, unknown>
): Array<RuleOutcome & { ruleId: string; label: string }> {
  return ruleIds.map((id) => {
    const rule = RULES.get(id);
    if (!rule) {
      // A metadata reference to a rule that does not exist would otherwise pass
      // silently, leaving a field the operator believes is guarded unguarded.
      return {
        ruleId: id,
        label: id,
        passed: false,
        severity: "error" as RuleSeverity,
        message: `Unknown business rule '${id}' — declared in metadata but never registered.`,
      };
    }
    return { ruleId: rule.id, label: rule.label, ...rule.evaluate(record) };
  });
}

export function getBusinessRuleStats(): { total: number; bySeverity: Record<string, number> } {
  const bySeverity: Record<string, number> = {};
  for (const rule of Array.from(RULES.values())) {
    bySeverity[rule.severity] = (bySeverity[rule.severity] ?? 0) + 1;
  }
  return { total: RULES.size, bySeverity };
}
