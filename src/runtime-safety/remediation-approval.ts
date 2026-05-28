import { isRuntimePaused } from "@/lib/governance/operator"

export interface RemediationApprovalRequest {
  requestId: string
  remediationId: string
  actionType: string
  tenantId?: string
  impactScore: number
  requiresApproval: boolean
  approvedBy?: string
  approvedAt?: string
  deniedBy?: string
  deniedReason?: string
  status: "pending" | "approved" | "denied" | "auto_approved" | "expired"
  expiresAt: string
  createdAt: string
}

const REQUESTS: RemediationApprovalRequest[] = []
const REQUESTS_CAP = 500

export function requestApproval(
  remediationId: string,
  actionType: string,
  impactScore: number,
  tenantId?: string
): RemediationApprovalRequest {
  if (isRuntimePaused()) throw new Error("Runtime is paused — approval request blocked")
  if (REQUESTS.length >= REQUESTS_CAP) REQUESTS.shift()

  const requiresApproval = impactScore >= 60
  const status: RemediationApprovalRequest["status"] = requiresApproval ? "pending" : "auto_approved"
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()

  const request: RemediationApprovalRequest = {
    requestId: crypto.randomUUID(),
    remediationId,
    actionType,
    tenantId,
    impactScore,
    requiresApproval,
    status,
    expiresAt,
    createdAt: now.toISOString(),
  }

  REQUESTS.push(request)
  return request
}

export function approve(requestId: string, approvedBy: string): void {
  const req = REQUESTS.find((r) => r.requestId === requestId)
  if (!req) return
  req.status = "approved"
  req.approvedBy = approvedBy
  req.approvedAt = new Date().toISOString()
}

export function deny(requestId: string, deniedBy: string, reason: string): void {
  const req = REQUESTS.find((r) => r.requestId === requestId)
  if (!req) return
  req.status = "denied"
  req.deniedBy = deniedBy
  req.deniedReason = reason
}

export function expireStale(): number {
  const now = new Date().toISOString()
  let count = 0
  for (const req of REQUESTS) {
    if (req.status === "pending" && req.expiresAt < now) {
      req.status = "expired"
      count++
    }
  }
  return count
}

export function getPendingRequests(tenantId?: string): RemediationApprovalRequest[] {
  return REQUESTS.filter(
    (r) =>
      r.status === "pending" && (tenantId === undefined || r.tenantId === tenantId)
  )
}

export function getApprovalSummary(): {
  total: number
  approved: number
  denied: number
  auto_approved: number
  pending: number
  expired: number
} {
  const counts = { approved: 0, denied: 0, auto_approved: 0, pending: 0, expired: 0 }
  for (const r of REQUESTS) counts[r.status]++
  return { total: REQUESTS.length, ...counts }
}
