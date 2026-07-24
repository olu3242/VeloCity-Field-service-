// Knowledge Graph Integration — enriches execution context before planning.
// Wraps the existing knowledge-graph module to produce a KnowledgeContext
// that the AI Planner and Execution Engine can consume.

import {
  buildJobGraph,
  buildCustomerGraph,
  buildProviderGraph,
  buildGraphSummary,
  searchGraph,
} from "@/lib/knowledge-graph";
import type { KnowledgeContext } from "./types";

export interface KnowledgeRetrievalOptions {
  jobId?: string;
  customerId?: string;
  providerId?: string;
  intent?: string;
  includeSearch?: boolean;
}

// ── Context assembly ──────────────────────────────────────────────────────────

export async function assembleKnowledgeContext(
  tenantId: string,
  opts: KnowledgeRetrievalOptions,
): Promise<KnowledgeContext> {
  const hints: string[] = [];
  let entityType: string | undefined;
  let entityId: string | undefined;
  let totalNodes = 0;
  let totalEdges = 0;

  try {
    // Retrieve the most specific graph available for this execution
    if (opts.jobId) {
      const g = await buildJobGraph(tenantId, opts.jobId);
      totalNodes += g.nodes?.length ?? 0;
      totalEdges += g.edges?.length ?? 0;
      entityType = "job";
      entityId = opts.jobId;
      hints.push(`Job graph: ${totalNodes} nodes`);
    }

    if (opts.customerId) {
      const g = await buildCustomerGraph(tenantId, opts.customerId);
      totalNodes += g.nodes?.length ?? 0;
      totalEdges += g.edges?.length ?? 0;
      if (!entityType) { entityType = "customer"; entityId = opts.customerId; }
      hints.push(`Customer graph: ${g.nodes?.length ?? 0} nodes`);
    }

    if (opts.providerId) {
      const g = await buildProviderGraph(tenantId, opts.providerId);
      totalNodes += g.nodes?.length ?? 0;
      totalEdges += g.edges?.length ?? 0;
      if (!entityType) { entityType = "provider"; entityId = opts.providerId; }
      hints.push(`Provider graph: ${g.nodes?.length ?? 0} nodes`);
    }

    // Intent-driven search when no specific entity is known
    if (opts.includeSearch && opts.intent && totalNodes === 0) {
      const results = await searchGraph(tenantId, opts.intent, 10);
      totalNodes += results?.length ?? 0;
      hints.push(`Intent search: ${totalNodes} related entities`);
    }
  } catch {
    hints.push("Knowledge graph partially unavailable — proceeding with reduced context");
  }

  return {
    entityType,
    entityId,
    nodes: totalNodes,
    edges: totalEdges,
    hints,
    retrievedAt: new Date().toISOString(),
  };
}

// ── Tenant summary (for high-level planning) ──────────────────────────────────

export async function getTenantKnowledgeSummary(
  tenantId: string,
): Promise<{ summary: string; hints: string[] }> {
  const hints: string[] = [];

  try {
    const summary = await buildGraphSummary(tenantId);
    const nodeCount = (summary as { nodeCount?: number }).nodeCount ?? 0;
    const edgeCount = (summary as { edgeCount?: number }).edgeCount ?? 0;
    hints.push(`Platform graph: ${nodeCount} entities, ${edgeCount} relationships`);
    return {
      summary: JSON.stringify(summary).slice(0, 500),
      hints,
    };
  } catch {
    return { summary: "", hints: ["Knowledge graph summary unavailable"] };
  }
}

// ── Risk hints from knowledge (fed to AI Planner) ────────────────────────────

export function extractRiskHints(ctx: KnowledgeContext): string[] {
  const hints: string[] = [];

  if ((ctx.nodes ?? 0) === 0) {
    hints.push("No historical context available — higher risk execution");
  }

  if ((ctx.edges ?? 0) > 50) {
    hints.push("High entity interconnection — changes may have downstream effects");
  }

  return hints;
}
