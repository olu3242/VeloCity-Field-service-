export type MeshNodeType =
  | "entity"
  | "workflow"
  | "escalation"
  | "anomaly"
  | "decision"
  | "operator"
  | "integration"
  | "outcome";

export interface MeshNode {
  id: string;
  type: MeshNodeType;
  label: string;
  domain: string;
  weight: number;
  attributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MeshEdge {
  id: string;
  from: string;
  to: string;
  relationship: string;
  strength: number;
  metadata: Record<string, unknown>;
}

export interface IntelligenceMesh {
  nodes: Map<string, MeshNode>;
  edges: Map<string, MeshEdge>;
  addNode(node: Omit<MeshNode, "createdAt" | "updatedAt">): MeshNode;
  addEdge(edge: Omit<MeshEdge, "id">): MeshEdge;
  findRelated(nodeId: string, relationship?: string): MeshNode[];
  getInfluenceScore(nodeId: string): number;
  getHighWeightNodes(minWeight?: number): MeshNode[];
  toSummary(): { totalNodes: number; totalEdges: number; byType: Record<string, number> };
}

export function createIntelligenceMesh(): IntelligenceMesh {
  const nodes = new Map<string, MeshNode>();
  const edges = new Map<string, MeshEdge>();

  function addNode(node: Omit<MeshNode, "createdAt" | "updatedAt">): MeshNode {
    const now = new Date().toISOString();
    const full: MeshNode = { ...node, createdAt: now, updatedAt: now };
    nodes.set(full.id, full);
    return full;
  }

  function addEdge(edge: Omit<MeshEdge, "id">): MeshEdge {
    const id = `edge_${edge.from}_${edge.to}_${Date.now()}`;
    const full: MeshEdge = { ...edge, id };
    edges.set(id, full);
    return full;
  }

  function findRelated(nodeId: string, relationship?: string): MeshNode[] {
    const relatedIds = new Set<string>();
    for (const edge of Array.from(edges.values())) {
      if (edge.from === nodeId) {
        if (!relationship || edge.relationship === relationship) relatedIds.add(edge.to);
      }
      if (edge.to === nodeId) {
        if (!relationship || edge.relationship === relationship) relatedIds.add(edge.from);
      }
    }
    return Array.from(relatedIds)
      .map((id) => nodes.get(id))
      .filter((n): n is MeshNode => n !== undefined);
  }

  function getInfluenceScore(nodeId: string): number {
    let score = 0;
    for (const edge of Array.from(edges.values())) {
      if (edge.to === nodeId) score += edge.strength;
    }
    return score;
  }

  function getHighWeightNodes(minWeight = 0.7): MeshNode[] {
    return Array.from(nodes.values()).filter((n) => n.weight >= minWeight);
  }

  function toSummary(): { totalNodes: number; totalEdges: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const node of Array.from(nodes.values())) {
      byType[node.type] = (byType[node.type] ?? 0) + 1;
    }
    return { totalNodes: nodes.size, totalEdges: edges.size, byType };
  }

  return { nodes, edges, addNode, addEdge, findRelated, getInfluenceScore, getHighWeightNodes, toSummary };
}

export const GLOBAL_MESH = createIntelligenceMesh();
