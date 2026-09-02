// Enterprise Knowledge Graph — derives entity relationships from existing Supabase tables.
// No graph database needed; relationships are derived from existing FK structure.

import { getAdminClient } from "@/lib/supabase/admin";

export type NodeType =
  | "customer" | "provider" | "job" | "franchise" | "commercial_account"
  | "membership" | "contract" | "territory" | "payment" | "dispute";

export type RelationshipType =
  | "created" | "assigned_to" | "belongs_to" | "covers" | "holds" | "opened" | "linked_to";

export interface GraphNode {
  type: NodeType;
  id: string;
  label: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  from: GraphNode;
  relationship: RelationshipType;
  to: GraphNode;
}

export interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNode: GraphNode;
}

export interface GraphSummary {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
  mostConnected: GraphNode[];
}

export async function buildJobGraph(tenantId: string, jobId: string): Promise<EntityGraph> {
  const db = getAdminClient();
  const { data: job } = await db.from("jobs")
    .select("id, title, status, customer_id, provider_id")
    .eq("id", jobId)
    .single();

  if (!job) {
    const centerNode: GraphNode = { type: "job", id: jobId, label: "Unknown Job" };
    return { nodes: [], edges: [], centerNode };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const jobNode: GraphNode = { type: "job", id: job.id, label: (job.title as string | null) ?? `Job ${job.id.slice(0, 8)}`, properties: { status: job.status } };
  nodes.push(jobNode);

  if (job.customer_id) {
    const { data: profile } = await db.from("profiles").select("id, full_name").eq("id", job.customer_id).single();
    const customerNode: GraphNode = { type: "customer", id: job.customer_id, label: (profile?.full_name as string | null) ?? "Customer" };
    nodes.push(customerNode);
    edges.push({ from: customerNode, relationship: "created", to: jobNode });
  }

  if (job.provider_id) {
    const { data: provider } = await db.from("providers").select("id, business_name").eq("id", job.provider_id).single();
    if (provider) {
      const providerNode: GraphNode = { type: "provider", id: provider.id, label: (provider.business_name as string | null) ?? "Provider" };
      nodes.push(providerNode);
      edges.push({ from: jobNode, relationship: "assigned_to", to: providerNode });
    }
  }

  const { data: disputes } = await db.from("disputes").select("id, reason").eq("job_id", jobId).limit(3);
  for (const dispute of disputes ?? []) {
    const disputeNode: GraphNode = { type: "dispute", id: dispute.id, label: `Dispute: ${String(dispute.reason ?? "unknown").slice(0, 30)}` };
    nodes.push(disputeNode);
    edges.push({ from: jobNode, relationship: "linked_to", to: disputeNode });
  }

  return { nodes, edges, centerNode: jobNode };
}

export async function buildCustomerGraph(tenantId: string, customerId: string): Promise<EntityGraph> {
  const db = getAdminClient();
  const { data: profile } = await db.from("profiles").select("id, full_name, email").eq("id", customerId).single();
  const customerNode: GraphNode = { type: "customer", id: customerId, label: (profile?.full_name as string | null) ?? (profile?.email as string | null) ?? "Customer" };
  const nodes: GraphNode[] = [customerNode];
  const edges: GraphEdge[] = [];

  const [jobsResult, membershipsResult, disputesResult] = await Promise.all([
    db.from("jobs").select("id, title, status").eq("customer_id", customerId).eq("tenant_id", tenantId).limit(5),
    db.from("membership_subscriptions").select("id, plan_name, status").eq("customer_id", customerId).limit(3),
    db.from("disputes").select("id, reason, status").eq("customer_id", customerId).limit(3),
  ]);

  for (const job of jobsResult.data ?? []) {
    const jobNode: GraphNode = { type: "job", id: job.id, label: (job.title as string | null) ?? `Job ${job.id.slice(0, 8)}`, properties: { status: job.status } };
    nodes.push(jobNode);
    edges.push({ from: customerNode, relationship: "created", to: jobNode });
  }

  for (const sub of membershipsResult.data ?? []) {
    const membershipNode: GraphNode = { type: "membership", id: sub.id, label: (sub.plan_name as string | null) ?? "Membership", properties: { status: sub.status } };
    nodes.push(membershipNode);
    edges.push({ from: customerNode, relationship: "holds", to: membershipNode });
  }

  for (const dispute of disputesResult.data ?? []) {
    const disputeNode: GraphNode = { type: "dispute", id: dispute.id, label: `Dispute: ${String(dispute.reason ?? "unknown").slice(0, 30)}` };
    nodes.push(disputeNode);
    edges.push({ from: customerNode, relationship: "opened", to: disputeNode });
  }

  return { nodes, edges, centerNode: customerNode };
}

export async function buildGraphSummary(tenantId: string): Promise<GraphSummary> {
  const db = getAdminClient();

  const [c, p, j, m, d, t] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer").eq("tenant_id", tenantId),
    db.from("providers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("membership_subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("disputes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("franchise_territories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);

  const nodesByType: Record<string, number> = {
    customer: c.count ?? 0,
    provider: p.count ?? 0,
    job: j.count ?? 0,
    membership: m.count ?? 0,
    dispute: d.count ?? 0,
    territory: t.count ?? 0,
  };

  const nodeCount = Object.values(nodesByType).reduce((s, n) => s + n, 0);
  const edgeCount = (j.count ?? 0) * 2 + (m.count ?? 0) + (d.count ?? 0);

  const { data: topProviders } = await db.from("providers")
    .select("id, business_name, trust_score")
    .eq("tenant_id", tenantId)
    .order("trust_score", { ascending: false })
    .limit(5);

  const mostConnected: GraphNode[] = (topProviders ?? []).map(p => ({
    type: "provider" as NodeType,
    id: p.id,
    label: (p.business_name as string | null) ?? "Provider",
  }));

  return { nodeCount, edgeCount, nodesByType, mostConnected };
}

// Build a graph centered on a provider: jobs assigned, customers served, territory coverage
export async function buildProviderGraph(tenantId: string, providerId: string): Promise<EntityGraph> {
  const db = getAdminClient();
  const { data: provider } = await db.from("providers").select("id, business_name, user_id, zip_codes").eq("id", providerId).single();

  const providerNode: GraphNode = {
    type: "provider",
    id: providerId,
    label: (provider?.business_name as string | null) ?? "Provider",
  };
  const nodes: GraphNode[] = [providerNode];
  const edges: GraphEdge[] = [];

  const [jobsResult, disputesResult, skillsResult] = await Promise.all([
    db.from("jobs").select("id, title, status, customer_id").eq("provider_id", providerId).eq("tenant_id", tenantId).limit(5),
    db.from("disputes").select("id, reason, status").eq("provider_id", providerId).limit(3),
    db.from("provider_skills").select("id, service_type_id").eq("provider_id", providerId).limit(5),
  ]);

  for (const job of jobsResult.data ?? []) {
    const jobNode: GraphNode = { type: "job", id: job.id, label: (job.title as string | null) ?? `Job ${job.id.slice(0, 8)}`, properties: { status: job.status } };
    nodes.push(jobNode);
    edges.push({ from: providerNode, relationship: "assigned_to", to: jobNode });
  }

  for (const dispute of disputesResult.data ?? []) {
    const disputeNode: GraphNode = { type: "dispute", id: dispute.id, label: `Dispute: ${String(dispute.reason ?? "unknown").slice(0, 30)}` };
    nodes.push(disputeNode);
    edges.push({ from: disputeNode, relationship: "linked_to", to: providerNode });
  }

  return { nodes, edges, centerNode: providerNode };
}

// Search across entity types by label fragment
export async function searchGraph(tenantId: string, query: string, limit = 10): Promise<GraphNode[]> {
  const db = getAdminClient();
  const q = query.toLowerCase();

  const [customersResult, providersResult, jobsResult] = await Promise.all([
    db.from("profiles").select("id, full_name, email").eq("tenant_id", tenantId).eq("role", "customer").ilike("full_name", `%${q}%`).limit(limit),
    db.from("providers").select("id, business_name").eq("tenant_id", tenantId).ilike("business_name", `%${q}%`).limit(limit),
    db.from("jobs").select("id, title, status").eq("tenant_id", tenantId).ilike("title", `%${q}%`).limit(limit),
  ]);

  const results: GraphNode[] = [];
  for (const c of customersResult.data ?? []) {
    results.push({ type: "customer", id: c.id, label: (c.full_name as string | null) ?? (c.email as string | null) ?? "Customer" });
  }
  for (const p of providersResult.data ?? []) {
    results.push({ type: "provider", id: p.id, label: (p.business_name as string | null) ?? "Provider" });
  }
  for (const j of jobsResult.data ?? []) {
    results.push({ type: "job", id: j.id, label: (j.title as string | null) ?? `Job ${j.id.slice(0, 8)}`, properties: { status: j.status } });
  }

  return results.slice(0, limit);
}

// Generic entry point — routes to the right builder
export async function buildEntityGraph(tenantId: string, entityType: NodeType, entityId: string): Promise<EntityGraph> {
  switch (entityType) {
    case "customer": return buildCustomerGraph(tenantId, entityId);
    case "job": return buildJobGraph(tenantId, entityId);
    case "provider": return buildProviderGraph(tenantId, entityId);
    default: {
      const summary = await buildGraphSummary(tenantId);
      return {
        nodes: summary.mostConnected,
        edges: [],
        centerNode: { type: entityType, id: entityId, label: entityId.slice(0, 8) },
      };
    }
  }
}
