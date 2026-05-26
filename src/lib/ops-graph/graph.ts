export type NodeType =
  | "provider"
  | "customer"
  | "job"
  | "dispute"
  | "payout"
  | "workflow"
  | "agent"
  | "automation";

export type EdgeType =
  | "resolved_by"
  | "triggered_by"
  | "assigned_to"
  | "related_to"
  | "escalated_to"
  | "paid_via"
  | "disputed_by"
  | "processed_by";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  attributes: Record<string, unknown>;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OperationsGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  addNode(node: Omit<GraphNode, "createdAt">): GraphNode;
  addEdge(edge: Omit<GraphEdge, "id" | "createdAt">): GraphEdge;
  getNodeEdges(nodeId: string): GraphEdge[];
  getRelated(nodeId: string, edgeType?: EdgeType): GraphNode[];
  getSubgraph(rootNodeId: string, depth?: number): { nodes: GraphNode[]; edges: GraphEdge[] };
  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] };
}

export function createOperationsGraph(): OperationsGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  function addNode(node: Omit<GraphNode, "createdAt">): GraphNode {
    const full: GraphNode = { ...node, createdAt: new Date().toISOString() };
    nodes.set(full.id, full);
    return full;
  }

  function addEdge(edge: Omit<GraphEdge, "id" | "createdAt">): GraphEdge {
    const id = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const full: GraphEdge = { ...edge, id, createdAt: new Date().toISOString() };
    edges.set(id, full);
    return full;
  }

  function getNodeEdges(nodeId: string): GraphEdge[] {
    return Array.from(edges.values()).filter(
      (e) => e.from === nodeId || e.to === nodeId
    );
  }

  function getRelated(nodeId: string, edgeType?: EdgeType): GraphNode[] {
    const nodeEdges = getNodeEdges(nodeId).filter(
      (e) => edgeType === undefined || e.type === edgeType
    );
    const related: GraphNode[] = [];
    for (const edge of nodeEdges) {
      const otherId = edge.from === nodeId ? edge.to : edge.from;
      const other = nodes.get(otherId);
      if (other) related.push(other);
    }
    return related;
  }

  function getSubgraph(
    rootNodeId: string,
    depth = 1
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const queue: Array<{ id: string; level: number }> = [
      { id: rootNodeId, level: 0 },
    ];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { id, level } = item;

      if (visitedNodes.has(id)) continue;
      visitedNodes.add(id);

      if (level < depth) {
        const nodeEdges = getNodeEdges(id);
        for (const edge of nodeEdges) {
          visitedEdges.add(edge.id);
          const nextId = edge.from === id ? edge.to : edge.from;
          if (!visitedNodes.has(nextId)) {
            queue.push({ id: nextId, level: level + 1 });
          }
        }
      }
    }

    return {
      nodes: Array.from(visitedNodes)
        .map((id) => nodes.get(id))
        .filter((n): n is GraphNode => n !== undefined),
      edges: Array.from(visitedEdges)
        .map((id) => edges.get(id))
        .filter((e): e is GraphEdge => e !== undefined),
    };
  }

  function toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
    };
  }

  return { nodes, edges, addNode, addEdge, getNodeEdges, getRelated, getSubgraph, toJSON };
}

export const GLOBAL_GRAPH = createOperationsGraph();
