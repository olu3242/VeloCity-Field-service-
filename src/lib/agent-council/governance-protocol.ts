// Governance Protocol — every autonomous action flows through a proposal
// requiring tier-appropriate approvals before execution.

export type ProposalStatus = "pending_approval" | "approved" | "rejected" | "executed" | "cancelled";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface GovernanceProposal {
  id: string;
  action: string;
  description: string;
  proposedBy: string;
  riskLevel: RiskLevel;
  requiredApprovals: number;
  approvals: string[];
  rejections: { agentId: string; reason: string }[];
  status: ProposalStatus;
  simulationResult?: string;
  estimatedImpact: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
}

const PROPOSALS: GovernanceProposal[] = [];
const CAP = 300;

function requiredCount(risk: RiskLevel): number {
  if (risk === "low") return 1;
  if (risk === "medium") return 2;
  if (risk === "high") return 3;
  return 4;
}

export function proposeAction(params: {
  action: string;
  description: string;
  proposedBy: string;
  riskLevel: RiskLevel;
  estimatedImpact: string;
  simulationResult?: string;
  tenantId?: string;
}): GovernanceProposal {
  const now = new Date().toISOString();
  const p: GovernanceProposal = {
    id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    action: params.action,
    description: params.description,
    proposedBy: params.proposedBy,
    riskLevel: params.riskLevel,
    requiredApprovals: requiredCount(params.riskLevel),
    approvals: [],
    rejections: [],
    status: "pending_approval",
    simulationResult: params.simulationResult,
    estimatedImpact: params.estimatedImpact,
    tenantId: params.tenantId,
    createdAt: now,
    updatedAt: now,
  };
  if (PROPOSALS.length >= CAP) PROPOSALS.shift();
  PROPOSALS.push(p);
  return p;
}

export function approveProposal(id: string, agentId: string): GovernanceProposal | null {
  const p = PROPOSALS.find(p => p.id === id);
  if (!p || p.status !== "pending_approval") return null;
  if (!p.approvals.includes(agentId)) p.approvals.push(agentId);
  if (p.approvals.length >= p.requiredApprovals) p.status = "approved";
  p.updatedAt = new Date().toISOString();
  return p;
}

export function rejectProposal(id: string, agentId: string, reason: string): GovernanceProposal | null {
  const p = PROPOSALS.find(p => p.id === id);
  if (!p || p.status !== "pending_approval") return null;
  p.rejections.push({ agentId, reason });
  p.status = "rejected";
  p.updatedAt = new Date().toISOString();
  return p;
}

export function markProposalExecuted(id: string): GovernanceProposal | null {
  const p = PROPOSALS.find(p => p.id === id);
  if (!p || p.status !== "approved") return null;
  p.status = "executed";
  p.executedAt = new Date().toISOString();
  p.updatedAt = p.executedAt;
  return p;
}

export function getPendingProposals(tenantId?: string): GovernanceProposal[] {
  return PROPOSALS.filter(p => p.status === "pending_approval" && (!tenantId || p.tenantId === tenantId));
}

export function getApprovedProposals(): GovernanceProposal[] {
  return PROPOSALS.filter(p => p.status === "approved");
}

export function getProposalHistory(limit = 20): GovernanceProposal[] {
  return [...PROPOSALS].reverse().slice(0, limit);
}

export function getProposalStats() {
  const byRisk: Record<string, number> = {};
  for (const p of PROPOSALS) byRisk[p.riskLevel] = (byRisk[p.riskLevel] ?? 0) + 1;
  return {
    total: PROPOSALS.length,
    pending: PROPOSALS.filter(p => p.status === "pending_approval").length,
    approved: PROPOSALS.filter(p => p.status === "approved").length,
    executed: PROPOSALS.filter(p => p.status === "executed").length,
    rejected: PROPOSALS.filter(p => p.status === "rejected").length,
    byRisk,
  };
}
