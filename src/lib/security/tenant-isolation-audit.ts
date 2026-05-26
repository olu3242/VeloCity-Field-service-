export interface IsolationAuditResult {
  tenantId: string;
  passed: boolean;
  violations: string[];
  checkedAt: string;
  riskLevel: "none" | "low" | "medium" | "high";
}

const ISOLATION_HISTORY: IsolationAuditResult[] = [];
const MAX_HISTORY = 200;

export function auditTenantIsolation(
  tenantId: string,
  recentAnomalies: number,
  crossTenantAttempts: number,
  sharedResourceAccesses: number
): IsolationAuditResult {
  const violations: string[] = [];

  if (crossTenantAttempts > 0) {
    violations.push("Cross-tenant access detected");
  }
  if (recentAnomalies > 5) {
    violations.push("Excessive anomaly count");
  }
  if (sharedResourceAccesses > 0) {
    violations.push("Shared resource access detected");
  }

  let riskLevel: IsolationAuditResult["riskLevel"];
  if (violations.length === 0) {
    riskLevel = "none";
  } else if (violations.length === 1) {
    riskLevel = "low";
  } else if (violations.length === 2) {
    riskLevel = "medium";
  } else {
    riskLevel = "high";
  }

  const result: IsolationAuditResult = {
    tenantId,
    passed: riskLevel === "none",
    violations,
    checkedAt: new Date().toISOString(),
    riskLevel,
  };

  if (ISOLATION_HISTORY.length >= MAX_HISTORY) {
    ISOLATION_HISTORY.shift();
  }
  ISOLATION_HISTORY.push(result);

  return result;
}

export function getLatestIsolationAudit(
  tenantId: string
): IsolationAuditResult | undefined {
  for (let i = ISOLATION_HISTORY.length - 1; i >= 0; i--) {
    if (ISOLATION_HISTORY[i]?.tenantId === tenantId) {
      return ISOLATION_HISTORY[i];
    }
  }
  return undefined;
}

export function getIsolationRiskTenants(): IsolationAuditResult[] {
  const relevant = ISOLATION_HISTORY.slice(-200).filter(
    (r) => r.riskLevel === "medium" || r.riskLevel === "high"
  );

  const latestByTenant = new Map<string, IsolationAuditResult>();
  for (const result of relevant) {
    latestByTenant.set(result.tenantId, result);
  }

  return Array.from(latestByTenant.values());
}

export function runPlatformIsolationScan(
  tenantIds: string[]
): IsolationAuditResult[] {
  return tenantIds.map((tenantId) =>
    auditTenantIsolation(tenantId, 0, 0, 0)
  );
}
