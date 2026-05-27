import { randomUUID } from "crypto";
import {
  getPolicy,
  type DataCategory,
} from "@/lib/data-governance/retention-policy";

export interface RetentionViolation {
  id: string;
  category: string;
  tenantId?: string;
  dataId: string;
  ageInDays: number;
  retentionDays: number;
  detectedAt: string;
  remediated: boolean;
}

const MAX_VIOLATIONS = 500;
const VIOLATIONS: RetentionViolation[] = [];

export function checkRetention(
  category: DataCategory,
  dataId: string,
  createdAtMs: number,
  tenantId?: string
): RetentionViolation | null {
  const ageInDays = (Date.now() - createdAtMs) / 86_400_000;
  const policy = getPolicy(category);
  if (ageInDays <= policy.retentionDays) return null;

  const violation: RetentionViolation = {
    id: randomUUID(),
    category,
    tenantId,
    dataId,
    ageInDays,
    retentionDays: policy.retentionDays,
    detectedAt: new Date().toISOString(),
    remediated: false,
  };
  VIOLATIONS.push(violation);
  if (VIOLATIONS.length > MAX_VIOLATIONS) {
    VIOLATIONS.shift();
  }
  return violation;
}

export function getViolations(tenantId?: string): RetentionViolation[] {
  return VIOLATIONS.filter((v) => {
    if (v.remediated) return false;
    if (tenantId !== undefined && v.tenantId !== tenantId) return false;
    return true;
  });
}

export function remediateViolation(id: string): void {
  const v = VIOLATIONS.find((v) => v.id === id);
  if (v !== undefined) {
    v.remediated = true;
  }
}

export function getRetentionComplianceScore(): number {
  const total = VIOLATIONS.length;
  if (total === 0) return 100;
  const open = VIOLATIONS.filter((v) => !v.remediated).length;
  return ((total - open) / total) * 100;
}
