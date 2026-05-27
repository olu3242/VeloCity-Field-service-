export type PrivilegeLevel = "public" | "tenant" | "admin" | "system";

export interface PrivilegeAuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  requiredLevel: PrivilegeLevel;
  grantedLevel: PrivilegeLevel;
  allowed: boolean;
  tenantId?: string;
  timestamp: string;
  signature?: string;
}

const PRIVILEGE_ORDER: Record<PrivilegeLevel, number> = {
  public: 0,
  tenant: 1,
  admin: 2,
  system: 3,
};

const AUDIT_LOG: PrivilegeAuditEntry[] = [];
const MAX_AUDIT_LOG = 1000;

export function auditPrivilege(
  actor: string,
  action: string,
  resource: string,
  requiredLevel: PrivilegeLevel,
  grantedLevel: PrivilegeLevel,
  tenantId?: string
): PrivilegeAuditEntry {
  if (AUDIT_LOG.length >= MAX_AUDIT_LOG) {
    AUDIT_LOG.shift();
  }

  const entry: PrivilegeAuditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    actor,
    action,
    resource,
    requiredLevel,
    grantedLevel,
    allowed: PRIVILEGE_ORDER[grantedLevel] >= PRIVILEGE_ORDER[requiredLevel],
    tenantId,
    timestamp: new Date().toISOString(),
  };

  AUDIT_LOG.push(entry);
  return entry;
}

export function getPrivilegeViolations(tenantId?: string): PrivilegeAuditEntry[] {
  return AUDIT_LOG.filter(
    (e) =>
      !e.allowed &&
      (tenantId === undefined || e.tenantId === tenantId)
  );
}

export function generateExecutionSignature(
  agentName: string,
  payload: Record<string, unknown>
): string {
  return `${agentName}:${Object.keys(payload).sort().join(",")}`;
}

export function validateSignature(
  agentName: string,
  payload: Record<string, unknown>,
  signature: string
): boolean {
  return generateExecutionSignature(agentName, payload) === signature;
}

export function getRecentAudits(limit = 50): PrivilegeAuditEntry[] {
  return AUDIT_LOG.slice(-limit).reverse();
}
