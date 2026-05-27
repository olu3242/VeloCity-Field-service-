export interface SwarmConsensus {
  id: string
  topic: string
  tenantId?: string
  participants: string[]
  votes: Record<string, "approve" | "reject" | "abstain">
  outcome: "pending" | "approved" | "rejected"
  requiredMajority: number
  createdAt: string
  resolvedAt?: string
}

const CONSENSUS: SwarmConsensus[] = []
const CONSENSUS_CAP = 100

export function initiateConsensus(
  topic: string,
  participants: string[],
  requiredMajority = 0.6,
  tenantId?: string,
): SwarmConsensus {
  const consensus: SwarmConsensus = {
    id: crypto.randomUUID(),
    topic,
    tenantId,
    participants,
    votes: {},
    outcome: "pending",
    requiredMajority,
    createdAt: new Date().toISOString(),
  }
  CONSENSUS.push(consensus)
  if (CONSENSUS.length > CONSENSUS_CAP) CONSENSUS.splice(0, CONSENSUS.length - CONSENSUS_CAP)
  return consensus
}

export function castConsensusVote(
  id: string,
  agentId: string,
  vote: "approve" | "reject" | "abstain",
): void {
  const c = CONSENSUS.find((x) => x.id === id)
  if (!c || c.outcome !== "pending") return
  if (!c.participants.includes(agentId)) return
  c.votes[agentId] = vote
}

export function evaluateConsensus(id: string): SwarmConsensus {
  const c = CONSENSUS.find((x) => x.id === id)
  if (!c) throw new Error(`Consensus ${id} not found`)
  if (c.outcome !== "pending") return c

  const totalVotes = Object.keys(c.votes).length
  if (totalVotes === 0) return c

  const approvals = Object.values(c.votes).filter((v) => v === "approve").length
  const ratio = totalVotes > 0 ? approvals / c.participants.length : 0

  if (ratio >= c.requiredMajority) {
    c.outcome = "approved"
    c.resolvedAt = new Date().toISOString()
  } else if (totalVotes >= c.participants.length) {
    c.outcome = "rejected"
    c.resolvedAt = new Date().toISOString()
  }
  return c
}

export function getPendingConsensus(): SwarmConsensus[] {
  return CONSENSUS.filter((c) => c.outcome === "pending")
}
