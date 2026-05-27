/**
 * Policy Node — hierarchical registry of policy graph nodes.
 * Pre-registers 3 root nodes; supports parent/child linking.
 */

export interface PolicyNode {
  id: string;
  policyId: string;
  name: string;
  type: "rule" | "escalation" | "compliance" | "governance";
  parentId?: string;
  childIds: string[];
  active: boolean;
  createdAt: string;
}

export const POLICY_NODES: Map<string, PolicyNode> = new Map();

function makeRoot(
  policyId: string,
  name: string,
  type: PolicyNode["type"]
): PolicyNode {
  return {
    id: crypto.randomUUID(),
    policyId,
    name,
    type,
    childIds: [],
    active: true,
    createdAt: new Date().toISOString(),
  };
}

POLICY_NODES.set("root-governance", makeRoot("root-governance", "Root Governance", "governance"));
POLICY_NODES.set("root-escalation", makeRoot("root-escalation", "Root Escalation", "escalation"));
POLICY_NODES.set("root-compliance", makeRoot("root-compliance", "Root Compliance", "compliance"));

export function registerPolicyNode(
  policyId: string,
  name: string,
  type: PolicyNode["type"],
  parentId?: string
): PolicyNode {
  const node: PolicyNode = {
    id: crypto.randomUUID(),
    policyId,
    name,
    type,
    parentId,
    childIds: [],
    active: true,
    createdAt: new Date().toISOString(),
  };

  POLICY_NODES.set(policyId, node);

  if (parentId) {
    const parent = POLICY_NODES.get(parentId);
    if (parent && !parent.childIds.includes(policyId)) {
      parent.childIds.push(policyId);
    }
  }

  return node;
}

export function getPolicyNode(policyId: string): PolicyNode | undefined {
  return POLICY_NODES.get(policyId);
}

export function getChildren(policyId: string): PolicyNode[] {
  const node = POLICY_NODES.get(policyId);
  if (!node) return [];
  return node.childIds
    .map((cid) => POLICY_NODES.get(cid))
    .filter((n): n is PolicyNode => n !== undefined);
}

export function getPolicyLineage(policyId: string): PolicyNode[] {
  const chain: PolicyNode[] = [];
  let current = POLICY_NODES.get(policyId);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? POLICY_NODES.get(current.parentId) : undefined;
  }
  return chain;
}
