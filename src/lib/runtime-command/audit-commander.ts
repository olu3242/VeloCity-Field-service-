/**
 * Audit Commander — maintains an audit trail of runtime commands.
 * In-memory singleton with rolling cap of 500 entries.
 */

const AUDIT_CAP = 500

export interface CommandAuditEntry {
  id: string
  commandId: string
  action: string
  issuedBy: string
  tenantId?: string
  detail: string
  auditedAt: string
}

const AUDIT_LOG: CommandAuditEntry[] = []

function enforceCap(): void {
  while (AUDIT_LOG.length > AUDIT_CAP) AUDIT_LOG.shift()
}

export function auditCommand(
  commandId: string,
  action: string,
  issuedBy: string,
  detail: string,
  tenantId?: string
): CommandAuditEntry {
  const entry: CommandAuditEntry = {
    id: crypto.randomUUID(),
    commandId,
    action,
    issuedBy,
    tenantId,
    detail,
    auditedAt: new Date().toISOString(),
  }
  AUDIT_LOG.push(entry)
  enforceCap()
  return entry
}

export function getCommandAudit(commandId: string): CommandAuditEntry[] {
  return AUDIT_LOG.filter((e) => e.commandId === commandId)
}

export function getRecentAudit(limit = 50): CommandAuditEntry[] {
  return AUDIT_LOG.slice(-limit)
}

export function getAuditByOperator(issuedBy: string): CommandAuditEntry[] {
  return AUDIT_LOG.filter((e) => e.issuedBy === issuedBy)
}
