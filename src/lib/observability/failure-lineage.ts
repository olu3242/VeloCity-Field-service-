export interface FailureNode {
  id: string;
  eventType: string;
  agentName?: string;
  tenantId?: string;
  error: string;
  timestamp: string;
  parentFailureId?: string;
  childFailureIds: string[];
}

const FAILURE_GRAPH_CAP = 500;
const FAILURE_GRAPH = new Map<string, FailureNode>();

export function recordFailure(
  eventType: string,
  error: string,
  options?: {
    agentName?: string;
    tenantId?: string;
    parentFailureId?: string;
  }
): FailureNode {
  const id = crypto.randomUUID();
  const node: FailureNode = {
    id,
    eventType,
    error,
    timestamp: new Date().toISOString(),
    childFailureIds: [],
    ...(options?.agentName !== undefined && { agentName: options.agentName }),
    ...(options?.tenantId !== undefined && { tenantId: options.tenantId }),
    ...(options?.parentFailureId !== undefined && {
      parentFailureId: options.parentFailureId,
    }),
  };

  if (options?.parentFailureId !== undefined) {
    const parent = FAILURE_GRAPH.get(options.parentFailureId);
    if (parent) {
      parent.childFailureIds.push(id);
    }
  }

  if (FAILURE_GRAPH.size >= FAILURE_GRAPH_CAP) {
    const oldestKey = Array.from(FAILURE_GRAPH.keys())[0];
    if (oldestKey !== undefined) {
      FAILURE_GRAPH.delete(oldestKey);
    }
  }

  FAILURE_GRAPH.set(id, node);
  return node;
}

export function getFailureChain(failureId: string): FailureNode[] {
  const chain: FailureNode[] = [];
  let current = FAILURE_GRAPH.get(failureId);

  while (current !== undefined) {
    chain.unshift(current);
    if (current.parentFailureId !== undefined) {
      current = FAILURE_GRAPH.get(current.parentFailureId);
    } else {
      break;
    }
  }

  return chain;
}

export function getRelatedFailures(failureId: string): FailureNode[] {
  const node = FAILURE_GRAPH.get(failureId);
  if (node === undefined || node.parentFailureId === undefined) return [];

  const parent = FAILURE_GRAPH.get(node.parentFailureId);
  if (parent === undefined) return [];

  return parent.childFailureIds
    .filter((childId) => childId !== failureId)
    .map((childId) => FAILURE_GRAPH.get(childId))
    .filter((n): n is FailureNode => n !== undefined);
}

export function getRecentFailures(limit = 20): FailureNode[] {
  return Array.from(FAILURE_GRAPH.values())
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export function getFailuresByEventType(
  eventType: string,
  limit = 20
): FailureNode[] {
  return Array.from(FAILURE_GRAPH.values())
    .filter((n) => n.eventType === eventType)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}
