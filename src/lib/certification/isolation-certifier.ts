import { assertTenantIsolation } from "@/lib/governance/tenant";

export interface IsolationCertification {
  tenantId: string;
  assertionsFired: number;
  violationsFound: number;
  certified: boolean;
  certifiedAt: string;
  notes: string[];
}

export interface PlatformIsolationReport {
  tenantsChecked: number;
  certified: number;
  failed: number;
  overallCertified: boolean;
  certifications: IsolationCertification[];
  generatedAt: string;
}

const CERTIFICATIONS: Map<string, IsolationCertification> = new Map();

export function certifyTenantIsolation(tenantId: string): IsolationCertification {
  const notes: string[] = [];
  let violationsFound = 0;

  // Assertion 1: same tenant must be allowed
  const sameResult = assertTenantIsolation(tenantId, tenantId);
  if (!sameResult.allowed) {
    violationsFound += 1;
    notes.push(`Same-tenant access unexpectedly denied: ${sameResult.reason ?? "unknown"}`);
  } else {
    notes.push("Same-tenant access correctly allowed");
  }

  // Assertion 2: cross-tenant access must be blocked
  const crossTenantId = "DIFFERENT_TENANT_" + tenantId;
  let crossBlocked = false;
  try {
    const crossResult = assertTenantIsolation(tenantId, crossTenantId);
    if (!crossResult.allowed) {
      crossBlocked = true;
      notes.push("Cross-tenant access correctly blocked");
    } else {
      notes.push("Cross-tenant access was incorrectly allowed");
    }
  } catch {
    crossBlocked = true;
    notes.push("Cross-tenant access threw (blocked as expected)");
  }

  if (!crossBlocked) {
    violationsFound += 1;
  }

  const certification: IsolationCertification = {
    tenantId,
    assertionsFired: 2,
    violationsFound,
    certified: violationsFound === 0,
    certifiedAt: new Date().toISOString(),
    notes,
  };

  CERTIFICATIONS.set(tenantId, certification);
  return certification;
}

export function runPlatformIsolationCertification(
  tenantIds: string[]
): PlatformIsolationReport {
  const certifications = tenantIds.map((id) => certifyTenantIsolation(id));
  const certified = certifications.filter((c) => c.certified).length;
  const failed = certifications.filter((c) => !c.certified).length;

  return {
    tenantsChecked: tenantIds.length,
    certified,
    failed,
    overallCertified: failed === 0 && tenantIds.length > 0,
    certifications,
    generatedAt: new Date().toISOString(),
  };
}

export function getCertification(tenantId: string): IsolationCertification | undefined {
  return CERTIFICATIONS.get(tenantId);
}
