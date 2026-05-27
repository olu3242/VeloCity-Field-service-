export interface NegotiationEntry {
  id: string;
  sessionId: string;
  tenantId: string;
  agents: string[];
  proposal: string;
  votes: Record<string, "agree" | "disagree" | "abstain">;
  outcome: "consensus" | "rejected" | "pending";
  createdAt: string;
}

export const NEGOTIATIONS: NegotiationEntry[] = [];
const CAP = 200;

export function proposeNegotiation(
  sessionId: string,
  tenantId: string,
  agents: string[],
  proposal: string
): NegotiationEntry {
  const entry: NegotiationEntry = {
    id: crypto.randomUUID(),
    sessionId,
    tenantId,
    agents,
    proposal,
    votes: {},
    outcome: "pending",
    createdAt: new Date().toISOString(),
  };
  NEGOTIATIONS.push(entry);
  if (NEGOTIATIONS.length > CAP) NEGOTIATIONS.shift();
  return entry;
}

export function castVote(
  id: string,
  agentName: string,
  vote: "agree" | "disagree" | "abstain"
): void {
  const entry = NEGOTIATIONS.find((n) => n.id === id);
  if (!entry) return;
  entry.votes[agentName] = vote;
}

export function evaluateNegotiation(id: string): NegotiationEntry {
  const entry = NEGOTIATIONS.find((n) => n.id === id);
  if (!entry) throw new Error(`Negotiation ${id} not found`);
  const voteValues = Object.values(entry.votes);
  const total = voteValues.length;
  const agreeCount = voteValues.filter((v) => v === "agree").length;
  if (total === 0) {
    entry.outcome = "rejected";
  } else if (agreeCount === total || agreeCount / total > 0.5) {
    entry.outcome = "consensus";
  } else {
    entry.outcome = "rejected";
  }
  return entry;
}

export function getActiveNegotiations(): NegotiationEntry[] {
  return NEGOTIATIONS.filter((n) => n.outcome === "pending");
}
