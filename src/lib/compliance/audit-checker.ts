import { randomUUID } from "crypto";

export interface AuditCompletenessCheck {
  checkId: string;
  domain: string;
  passed: boolean;
  coverage: number;             // 0-1: fraction of expected events that were audited
  missingAudits: string[];
  checkedAt: string;
}

const MAX_CHECKS = 100;
const CHECKS: AuditCompletenessCheck[] = [];

export function checkAuditCompleteness(
  domain: string,
  expectedAuditTypes: string[],
  presentAuditTypes: string[]
): AuditCompletenessCheck {
  const missing = expectedAuditTypes.filter(
    (t) => !presentAuditTypes.includes(t)
  );
  const coverage =
    (expectedAuditTypes.length - missing.length) /
    Math.max(1, expectedAuditTypes.length);
  const passed = coverage >= 0.9;
  const check: AuditCompletenessCheck = {
    checkId: randomUUID(),
    domain,
    passed,
    coverage,
    missingAudits: missing,
    checkedAt: new Date().toISOString(),
  };
  CHECKS.push(check);
  if (CHECKS.length > MAX_CHECKS) {
    CHECKS.shift();
  }
  return check;
}

export function getRecentChecks(
  domain?: string,
  limit = 20
): AuditCompletenessCheck[] {
  const filtered =
    domain !== undefined
      ? CHECKS.filter((c) => c.domain === domain)
      : CHECKS.slice();
  return filtered.slice(-limit);
}

export function getAverageCoverage(): number {
  const recent = CHECKS.slice(-20);
  if (recent.length === 0) return 0;
  const total = recent.reduce((sum, c) => sum + c.coverage, 0);
  return total / recent.length;
}
