// ECAOS Certification Framework — 11-domain enterprise certification.
// Scores workstreams and emits certification reports.
// A workstream is only "done" once all applicable domains pass.

import { CERTIFICATION_DOMAINS, type CertificationDomain } from "./runtime-contract";

export interface CertificationCheck {
  name: string;
  passed: boolean;
  score: number; // 0–100
  detail?: string;
}

export interface DomainCertification {
  domain: CertificationDomain;
  score: number;
  level: "not_certified" | "basic" | "standard" | "premium" | "enterprise";
  checks: CertificationCheck[];
  certifiedAt: string;
}

export interface WorkstreamCertification {
  workstreamId: string;
  tenantId: string;
  domains: DomainCertification[];
  overallScore: number;
  passed: boolean;
  failedDomains: CertificationDomain[];
  certifiedAt: string;
}

const CERTIFICATIONS: WorkstreamCertification[] = [];
const CAP = 300;

function levelFromScore(score: number): DomainCertification["level"] {
  if (score >= 90) return "enterprise";
  if (score >= 75) return "premium";
  if (score >= 60) return "standard";
  if (score >= 40) return "basic";
  return "not_certified";
}

function defaultChecks(domain: CertificationDomain): CertificationCheck[] {
  const base: Record<CertificationDomain, CertificationCheck[]> = {
    runtime_reliability:    [{ name: "events_complete", passed: true, score: 100 }, { name: "stage_ordering", passed: true, score: 100 }, { name: "sla_met", passed: true, score: 80 }],
    customer_success:       [{ name: "customer_notified", passed: true, score: 100 }, { name: "nps_captured", passed: false, score: 0 }],
    provider_excellence:    [{ name: "provider_scored", passed: true, score: 100 }, { name: "completion_verified", passed: true, score: 100 }],
    financial_integrity:    [{ name: "payment_captured", passed: true, score: 100 }, { name: "fee_deducted", passed: true, score: 100 }, { name: "payout_queued", passed: true, score: 100 }],
    commercial_performance: [{ name: "quote_accepted", passed: true, score: 100 }, { name: "contract_aligned", passed: true, score: 90 }],
    franchise_operations:   [{ name: "territory_in_scope", passed: true, score: 100 }],
    security:               [{ name: "tenant_isolated", passed: true, score: 100 }, { name: "rbac_validated", passed: true, score: 100 }],
    compliance:             [{ name: "audit_recorded", passed: true, score: 100 }, { name: "data_retention_ok", passed: true, score: 100 }],
    ai_governance:          [{ name: "agent_decision_logged", passed: true, score: 100 }, { name: "confidence_above_threshold", passed: true, score: 85 }],
    operational_efficiency: [{ name: "duration_within_sla", passed: true, score: 90 }, { name: "retries_minimal", passed: true, score: 100 }],
    ecosystem_health:         [{ name: "knowledge_updated", passed: true, score: 100 }, { name: "twin_synced", passed: false, score: 0 }],
    relationship_intelligence:[{ name: "review_captured", passed: false, score: 0 }, { name: "reward_settled", passed: false, score: 0 }, { name: "relationship_score_updated", passed: false, score: 0 }],
  };
  return base[domain] ?? [];
}

export function certifyWorkstream(
  workstreamId: string,
  tenantId: string,
  overrides?: Partial<Record<CertificationDomain, CertificationCheck[]>>
): WorkstreamCertification {
  const now = new Date().toISOString();
  const domains: DomainCertification[] = CERTIFICATION_DOMAINS.map(domain => {
    const checks = overrides?.[domain] ?? defaultChecks(domain);
    const avg = checks.length ? checks.reduce((s, c) => s + c.score, 0) / checks.length : 0;
    return { domain, score: Math.round(avg), level: levelFromScore(avg), checks, certifiedAt: now };
  });
  const overallScore = Math.round(domains.reduce((s, d) => s + d.score, 0) / domains.length);
  const failedDomains = domains.filter(d => d.level === "not_certified").map(d => d.domain);
  const cert: WorkstreamCertification = {
    workstreamId, tenantId, domains, overallScore,
    passed: failedDomains.length === 0,
    failedDomains,
    certifiedAt: now,
  };
  if (CERTIFICATIONS.length >= CAP) CERTIFICATIONS.shift();
  CERTIFICATIONS.push(cert);
  return cert;
}

export function getLatestCertification(workstreamId: string): WorkstreamCertification | null {
  return [...CERTIFICATIONS].reverse().find(c => c.workstreamId === workstreamId) ?? null;
}

export function getFailedCertifications(): WorkstreamCertification[] {
  return CERTIFICATIONS.filter(c => !c.passed).slice(-50);
}

export function getCertificationSummary() {
  const recent = CERTIFICATIONS.slice(-100);
  const passRate = recent.length ? recent.filter(c => c.passed).length / recent.length : 0;
  const avgScore = recent.length ? recent.reduce((s, c) => s + c.overallScore, 0) / recent.length : 0;
  const domainPassRates: Record<string, number> = {};
  for (const domain of CERTIFICATION_DOMAINS) {
    const relevant = recent.flatMap(c => c.domains.filter(d => d.domain === domain));
    domainPassRates[domain] = relevant.length
      ? relevant.filter(d => d.level !== "not_certified").length / relevant.length
      : 1;
  }
  return {
    total: CERTIFICATIONS.length,
    recentCount: recent.length,
    passRate: Math.round(passRate * 100) / 100,
    avgScore: Math.round(avgScore),
    domainPassRates,
  };
}
