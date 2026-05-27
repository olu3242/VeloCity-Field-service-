// Governance wrapper ensuring adaptive changes are explainable, observable, and reversible.

export interface AdaptationProposal {
  id: string;
  source: "learning_engine" | "operator" | "telemetry" | "anomaly_detection";
  target: string;
  currentValue: unknown;
  proposedValue: unknown;
  justification: string;
  riskLevel: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "applied" | "rolled_back";
  proposedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

const PROPOSALS = new Map<string, AdaptationProposal>();
let proposalCounter = 0;

function statusForRisk(
  riskLevel: AdaptationProposal["riskLevel"]
): AdaptationProposal["status"] {
  if (riskLevel === "low") return "approved";
  return "pending";
}

export function proposeAdaptation(
  proposal: Omit<AdaptationProposal, "id" | "proposedAt" | "status">
): AdaptationProposal {
  const id = `prop_${++proposalCounter}_${Date.now()}`;
  const full: AdaptationProposal = {
    ...proposal,
    id,
    proposedAt: new Date().toISOString(),
    status: statusForRisk(proposal.riskLevel),
  };
  PROPOSALS.set(id, full);
  return full;
}

export function approveProposal(id: string, adminId: string): boolean {
  const proposal = PROPOSALS.get(id);
  if (!proposal) return false;
  proposal.status = "approved";
  proposal.resolvedAt = new Date().toISOString();
  proposal.resolvedBy = adminId;
  return true;
}

export function rejectProposal(id: string, adminId: string): boolean {
  const proposal = PROPOSALS.get(id);
  if (!proposal) return false;
  proposal.status = "rejected";
  proposal.resolvedAt = new Date().toISOString();
  proposal.resolvedBy = adminId;
  return true;
}

export function rollbackProposal(id: string, adminId: string): boolean {
  const proposal = PROPOSALS.get(id);
  if (!proposal) return false;
  proposal.status = "rolled_back";
  proposal.resolvedAt = new Date().toISOString();
  proposal.resolvedBy = adminId;
  return true;
}

export function getPendingProposals(): AdaptationProposal[] {
  return Array.from(PROPOSALS.values()).filter((p) => p.status === "pending");
}

export function getAppliedProposals(): AdaptationProposal[] {
  return Array.from(PROPOSALS.values()).filter((p) => p.status === "applied");
}

export function getProposalExplanation(id: string): string {
  const proposal = PROPOSALS.get(id);
  if (!proposal) return `No proposal found with id: ${id}`;

  const from = JSON.stringify(proposal.currentValue);
  const to = JSON.stringify(proposal.proposedValue);
  const when = proposal.proposedAt;
  const resolvedNote = proposal.resolvedAt
    ? ` Resolved at ${proposal.resolvedAt} by ${proposal.resolvedBy ?? "unknown"}.`
    : "";

  return (
    `[${proposal.id}] Source: ${proposal.source} | Risk: ${proposal.riskLevel} | ` +
    `Status: ${proposal.status}\n` +
    `Target: "${proposal.target}" — changing from ${from} to ${to}.\n` +
    `Justification: ${proposal.justification}\n` +
    `Proposed at: ${when}.${resolvedNote}`
  );
}
