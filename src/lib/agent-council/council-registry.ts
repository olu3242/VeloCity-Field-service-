// Agent Council Registry — all ECAOS agents organized by tier.
// Pre-seeds the 12 named agents; supports runtime registration of extensions.

export type CouncilTier = "strategic" | "operational" | "commercial" | "governance" | "platform" | "knowledge";
export type AgentStatus = "available" | "busy" | "offline" | "suspended";

export interface CouncilAgent {
  id: string;
  name: string;
  tier: CouncilTier;
  capabilities: string[];
  status: AgentStatus;
  currentLoad: number;
  decisionsThisHour: number;
  lastActiveAt: string;
  registeredAt: string;
}

const REGISTRY = new Map<string, CouncilAgent>();
const CAP = 200;

const BUILT_IN: Omit<CouncilAgent, "currentLoad" | "decisionsThisHour" | "lastActiveAt" | "registeredAt">[] = [
  { id: "executive-orchestrator", name: "Executive Orchestrator",   tier: "strategic",    capabilities: ["strategy", "escalation", "council-coordination"], status: "available" },
  { id: "innovation-council",     name: "Innovation Council",       tier: "strategic",    capabilities: ["roadmap", "experiments", "evolution"],            status: "available" },
  { id: "max",                    name: "MAX — Dispatch",           tier: "operational",  capabilities: ["dispatch", "routing", "scheduling"],              status: "available" },
  { id: "lena",                   name: "LENA — Workforce Growth",  tier: "operational",  capabilities: ["retention", "campaigns", "nps"],                  status: "available" },
  { id: "nova",                   name: "NOVA — Execution",         tier: "operational",  capabilities: ["job-tracking", "arrival", "completion"],          status: "available" },
  { id: "quinn",                  name: "QUINN — Quote & Pricing",  tier: "commercial",   capabilities: ["quoting", "pricing", "contracts"],                status: "available" },
  { id: "finn",                   name: "FINN — Finance",           tier: "commercial",   capabilities: ["payments", "payouts", "risk"],                    status: "available" },
  { id: "gabriel",                name: "GABRIEL — Governance",     tier: "governance",   capabilities: ["policy", "audit", "compliance", "drift"],         status: "available" },
  { id: "ivy",                    name: "IVY — Dispute",            tier: "governance",   capabilities: ["disputes", "arbitration", "resolution"],          status: "available" },
  { id: "rex",                    name: "REX — Review & Completion",tier: "platform",     capabilities: ["reviews", "nps", "completion-scoring"],           status: "available" },
  { id: "alice",                  name: "ALICE — Intake",           tier: "platform",     capabilities: ["intake", "classification", "job-creation"],       status: "available" },
  { id: "tess",                   name: "TESS — Territory",         tier: "knowledge",    capabilities: ["territory", "provider-scoring", "demand"],        status: "available" },
];

export function initCouncil(): void {
  if (REGISTRY.size > 0) return;
  const now = new Date().toISOString();
  for (const a of BUILT_IN) {
    REGISTRY.set(a.id, { ...a, currentLoad: 0, decisionsThisHour: 0, lastActiveAt: now, registeredAt: now });
  }
}
initCouncil();

export function registerCouncilAgent(name: string, tier: CouncilTier, capabilities: string[]): CouncilAgent {
  const id = `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const agent: CouncilAgent = { id, name, tier, capabilities, status: "available", currentLoad: 0, decisionsThisHour: 0, lastActiveAt: now, registeredAt: now };
  if (REGISTRY.size >= CAP) {
    const oldest = Array.from(REGISTRY.entries()).sort((a, b) => a[1].registeredAt.localeCompare(b[1].registeredAt))[0];
    if (oldest) REGISTRY.delete(oldest[0]);
  }
  REGISTRY.set(id, agent);
  return agent;
}

export function updateAgentStatus(id: string, status: AgentStatus, load?: number): void {
  const agent = REGISTRY.get(id);
  if (!agent) return;
  agent.status = status;
  if (typeof load === "number") agent.currentLoad = Math.min(100, Math.max(0, load));
  agent.lastActiveAt = new Date().toISOString();
}

export function recordAgentDecision(id: string): void {
  const agent = REGISTRY.get(id);
  if (!agent) return;
  agent.decisionsThisHour++;
  agent.lastActiveAt = new Date().toISOString();
}

export function getAgentsByTier(tier: CouncilTier): CouncilAgent[] {
  return Array.from(REGISTRY.values()).filter(a => a.tier === tier);
}

export function getAvailableAgents(tier?: CouncilTier): CouncilAgent[] {
  return Array.from(REGISTRY.values()).filter(a => a.status === "available" && (!tier || a.tier === tier));
}

export function getCouncilAgent(id: string): CouncilAgent | undefined {
  return REGISTRY.get(id);
}

export function getAllAgents(): CouncilAgent[] {
  return Array.from(REGISTRY.values());
}

export function getCouncilSummary() {
  const agents = Array.from(REGISTRY.values());
  const byTier: Record<string, number> = {};
  for (const a of agents) byTier[a.tier] = (byTier[a.tier] ?? 0) + 1;
  return {
    total: agents.length,
    available: agents.filter(a => a.status === "available").length,
    busy: agents.filter(a => a.status === "busy").length,
    offline: agents.filter(a => a.status === "offline").length,
    byTier,
    totalDecisionsThisHour: agents.reduce((s, a) => s + a.decisionsThisHour, 0),
  };
}
