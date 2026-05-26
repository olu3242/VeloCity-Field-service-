/**
 * VeloCity Consensus Handler
 *
 * Multi-agent voting system with threshold-based approval/rejection.
 * Proposal store is capped at 100 entries.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface ConsensusVote {
  agentName: string;
  vote: "approve" | "reject" | "abstain";
  reason?: string;
  timestamp: string;
}

export interface ConsensusProposal {
  id: string;
  topic: string;
  proposedBy: string;
  votes: ConsensusVote[];
  threshold: number;
  status: "open" | "approved" | "rejected" | "expired";
  createdAt: string;
  decidedAt?: string;
  expiresAt: string;
}

// ── Module state ──────────────────────────────────────────────────────────

export const PROPOSALS: Map<string, ConsensusProposal> = new Map();
const PROPOSAL_CAP = 100;

// ── Helpers ───────────────────────────────────────────────────────────────

function enforceProposalCap(): void {
  if (PROPOSALS.size <= PROPOSAL_CAP) return;
  const keys = Array.from(PROPOSALS.keys());
  PROPOSALS.delete(keys[0]);
}

// ── Public API ────────────────────────────────────────────────────────────

export function proposeConsensus(
  topic: string,
  proposedBy: string,
  threshold = 0.6,
  ttlMs = 300_000,
): ConsensusProposal {
  const now = new Date();
  const proposal: ConsensusProposal = {
    id: crypto.randomUUID(),
    topic,
    proposedBy,
    votes: [],
    threshold,
    status: "open",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  PROPOSALS.set(proposal.id, proposal);
  enforceProposalCap();
  return proposal;
}

export function castVote(
  proposalId: string,
  agentName: string,
  vote: "approve" | "reject" | "abstain",
  reason?: string,
): ConsensusProposal {
  const proposal = PROPOSALS.get(proposalId);
  if (!proposal) {
    throw new Error(`Proposal ${proposalId} not found`);
  }

  const entry: ConsensusVote = {
    agentName,
    vote,
    timestamp: new Date().toISOString(),
  };
  if (reason !== undefined) entry.reason = reason;

  proposal.votes.push(entry);
  return evaluateProposal(proposalId);
}

export function evaluateProposal(proposalId: string): ConsensusProposal {
  const proposal = PROPOSALS.get(proposalId);
  if (!proposal) {
    throw new Error(`Proposal ${proposalId} not found`);
  }

  if (proposal.status !== "open") return proposal;

  const now = new Date().toISOString();

  if (now > proposal.expiresAt) {
    proposal.status = "expired";
    proposal.decidedAt = now;
    return proposal;
  }

  const total = proposal.votes.length;
  if (total === 0) return proposal;

  const approvals = proposal.votes.filter((v) => v.vote === "approve").length;
  const rejections = proposal.votes.filter((v) => v.vote === "reject").length;

  if (approvals / total >= proposal.threshold) {
    proposal.status = "approved";
    proposal.decidedAt = now;
  } else if (rejections / total > 1 - proposal.threshold) {
    proposal.status = "rejected";
    proposal.decidedAt = now;
  }

  return proposal;
}

export function getOpenProposals(): ConsensusProposal[] {
  const now = new Date().toISOString();
  return Array.from(PROPOSALS.values()).filter(
    (p) => p.status === "open" && p.expiresAt > now,
  );
}

export function getConsensusStats(): {
  total: number;
  approved: number;
  rejected: number;
  expired: number;
} {
  const all = Array.from(PROPOSALS.values());
  return {
    total: all.length,
    approved: all.filter((p) => p.status === "approved").length,
    rejected: all.filter((p) => p.status === "rejected").length,
    expired: all.filter((p) => p.status === "expired").length,
  };
}
