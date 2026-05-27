export interface ExecutionNode {
  id: string;
  eventType: string;
  agentName?: string;
  tenantId?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: "running" | "success" | "failed" | "skipped";
  parentId?: string;
  childIds: string[];
  metadata: Record<string, unknown>;
}

const NODES: Map<string, ExecutionNode> = new Map();
const MAX_NODES = 2000;

export function startNode(
  eventType: string,
  options?: {
    agentName?: string;
    tenantId?: string;
    parentId?: string;
    metadata?: Record<string, unknown>;
  }
): ExecutionNode {
  if (NODES.size >= MAX_NODES) {
    const oldestKey = NODES.keys().next().value;
    if (oldestKey !== undefined) {
      NODES.delete(oldestKey);
    }
  }

  const node: ExecutionNode = {
    id: crypto.randomUUID(),
    eventType,
    agentName: options?.agentName,
    tenantId: options?.tenantId,
    startedAt: new Date().toISOString(),
    status: "running",
    parentId: options?.parentId,
    childIds: [],
    metadata: options?.metadata ?? {},
  };

  NODES.set(node.id, node);

  if (options?.parentId) {
    const parent = NODES.get(options.parentId);
    if (parent) {
      parent.childIds.push(node.id);
    }
  }

  return node;
}

export function completeNode(
  id: string,
  status: "success" | "failed" | "skipped"
): void {
  const node = NODES.get(id);
  if (!node) return;
  node.completedAt = new Date().toISOString();
  node.durationMs =
    new Date(node.completedAt).getTime() - new Date(node.startedAt).getTime();
  node.status = status;
}

export function getNode(id: string): ExecutionNode | undefined {
  return NODES.get(id);
}

export function getLineage(id: string): ExecutionNode[] {
  const chain: ExecutionNode[] = [];
  let current = NODES.get(id);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? NODES.get(current.parentId) : undefined;
  }
  return chain;
}

export function getChildren(id: string): ExecutionNode[] {
  const node = NODES.get(id);
  if (!node) return [];
  return node.childIds
    .map((cid) => NODES.get(cid))
    .filter((n): n is ExecutionNode => n !== undefined);
}

export function getRecentNodes(limit = 20): ExecutionNode[] {
  const all = Array.from(NODES.values());
  return all.slice(-limit);
}
