export interface WorkflowChain {
  id: string;
  tenantId: string;
  rootWorkflowId: string;
  chainedWorkflowIds: string[];
  domain: string;
  status: "active" | "completed" | "broken";
  createdAt: string;
  updatedAt: string;
}

const CHAINS: Map<string, WorkflowChain> = new Map();
const CAP = 300;

export function createChain(
  tenantId: string,
  rootWorkflowId: string,
  domain: string
): WorkflowChain {
  if (CHAINS.size >= CAP) {
    const oldest = Array.from(CHAINS.keys())[0];
    if (oldest !== undefined) {
      CHAINS.delete(oldest);
    }
  }
  const now = new Date().toISOString();
  const chain: WorkflowChain = {
    id: crypto.randomUUID(),
    tenantId,
    rootWorkflowId,
    chainedWorkflowIds: [],
    domain,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  CHAINS.set(chain.id, chain);
  return chain;
}

export function appendToChain(chainId: string, workflowId: string): void {
  const chain = CHAINS.get(chainId);
  if (chain) {
    chain.chainedWorkflowIds.push(workflowId);
    chain.updatedAt = new Date().toISOString();
  }
}

export function markChainStatus(
  chainId: string,
  status: WorkflowChain["status"]
): void {
  const chain = CHAINS.get(chainId);
  if (chain) {
    chain.status = status;
    chain.updatedAt = new Date().toISOString();
  }
}

export function getChain(chainId: string): WorkflowChain | undefined {
  return CHAINS.get(chainId);
}

export function getActiveChains(tenantId?: string): WorkflowChain[] {
  const active = Array.from(CHAINS.values()).filter((c) => c.status === "active");
  if (tenantId !== undefined) {
    return active.filter((c) => c.tenantId === tenantId);
  }
  return active;
}
