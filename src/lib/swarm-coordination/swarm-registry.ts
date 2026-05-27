export interface SwarmAgent {
  agentId: string
  agentName: string
  tenantId?: string
  role: "leader" | "worker" | "specialist" | "observer"
  status: "active" | "idle" | "overloaded" | "offline"
  currentLoad: number
  assignedTasks: number
  completedTasks: number
  registeredAt: string
  lastActiveAt: string
}

const SWARM: Map<string, SwarmAgent> = new Map()
const SWARM_CAP = 200

export function registerSwarmAgent(
  agentName: string,
  role: SwarmAgent["role"],
  tenantId?: string,
): SwarmAgent {
  if (SWARM.size >= SWARM_CAP) {
    const oldest = Array.from(SWARM.keys())[0]
    if (oldest) SWARM.delete(oldest)
  }
  const agent: SwarmAgent = {
    agentId: crypto.randomUUID(),
    agentName,
    tenantId,
    role,
    status: "active",
    currentLoad: 0,
    assignedTasks: 0,
    completedTasks: 0,
    registeredAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  }
  SWARM.set(agent.agentId, agent)
  return agent
}

export function updateAgentLoad(agentId: string, currentLoad: number, assignedTasks: number): void {
  const agent = SWARM.get(agentId)
  if (!agent) return
  const status: SwarmAgent["status"] = currentLoad >= 80 ? "overloaded" : "active"
  SWARM.set(agentId, { ...agent, currentLoad, assignedTasks, status, lastActiveAt: new Date().toISOString() })
}

export function getAvailableAgents(role?: SwarmAgent["role"]): SwarmAgent[] {
  return Array.from(SWARM.values()).filter(
    (a) =>
      (a.status === "active" || a.status === "idle") &&
      a.currentLoad < 80 &&
      (role === undefined || a.role === role),
  )
}

export function getOverloadedAgents(): SwarmAgent[] {
  return Array.from(SWARM.values()).filter((a) => a.status === "overloaded")
}

export function getSwarmStats(): { total: number; active: number; overloaded: number; avgLoad: number } {
  const all = Array.from(SWARM.values())
  const active = all.filter((a) => a.status === "active" || a.status === "idle").length
  const overloaded = all.filter((a) => a.status === "overloaded").length
  const avgLoad = all.length > 0 ? all.reduce((s, a) => s + a.currentLoad, 0) / all.length : 0
  return { total: all.length, active, overloaded, avgLoad }
}
