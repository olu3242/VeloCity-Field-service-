import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantId } from "@/lib/tenancy";
import { buildGraphSummary, buildCustomerGraph } from "@/lib/knowledge-graph";

const NODE_COLORS: Record<string, string> = {
  customer: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  provider: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  job: "bg-green-500/20 text-green-300 border-green-500/30",
  membership: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  dispute: "bg-red-500/20 text-red-300 border-red-500/30",
  territory: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  contract: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  commercial_account: "bg-pink-500/20 text-pink-300 border-pink-500/30",
};

function NodeBadge({ type, label }: { type: string; label: string }) {
  const cls = NODE_COLORS[type] ?? "bg-white/10 text-white/60 border-white/10";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${cls}`}>
      <span className="opacity-60 text-[10px] uppercase">{type}</span>
      <span>{label}</span>
    </span>
  );
}

export default async function KnowledgeGraphPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const tenantId = getTenantId(profile);

  const [summary, recentCustomers] = await Promise.all([
    buildGraphSummary(tenantId),
    supabase.from("profiles").select("id, full_name, email").eq("tenant_id", tenantId).eq("role", "customer").order("created_at", { ascending: false }).limit(6),
  ]);

  // Build sample subgraph for the most recent customer
  const sampleCustomer = recentCustomers.data?.[0];
  const sampleGraph = sampleCustomer ? await buildCustomerGraph(tenantId, sampleCustomer.id) : null;

  const nodeTypeOrder = ["customer", "provider", "job", "membership", "dispute", "territory"];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Knowledge Graph</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/executive" className="text-white/40 hover:text-white">Executive OS</Link>
          <Link href="/admin/intelligence" className="text-white/40 hover:text-white">Intelligence</Link>
          <Link href="/admin/mission-control" className="text-white/40 hover:text-white">Mission Control</Link>
          <Link href="/admin/agents" className="text-white/40 hover:text-white">Agents</Link>
          <Link href="/admin/certification" className="text-white/40 hover:text-white">Certification</Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Enterprise Knowledge Graph</h1>
          <p className="text-white/40 text-sm mt-1">Entity relationships derived from live platform data</p>
        </div>

        {/* Node counts */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {nodeTypeOrder.map(type => (
            <Card key={type} className="bg-gray-900 border-white/10">
              <CardContent className="pt-4 pb-3 text-center">
                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${NODE_COLORS[type] ?? "bg-white/10"} border text-sm font-bold`}>
                  {(summary.nodesByType[type] ?? 0) > 99 ? "99+" : (summary.nodesByType[type] ?? 0)}
                </div>
                <p className="text-white/40 text-xs capitalize">{type.replace("_", " ")}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Nodes", value: summary.nodeCount.toLocaleString() },
            { label: "Relationships", value: summary.edgeCount.toLocaleString() },
            { label: "Node Types", value: Object.keys(summary.nodesByType).length },
            { label: "Graph Depth", value: "3 hops" },
          ].map(s => (
            <Card key={s.label} className="bg-gray-900 border-white/10">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Most connected providers */}
          <Card className="bg-gray-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-semibold">Most Connected Nodes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.mostConnected.length === 0 && (
                  <p className="text-white/30 text-sm">No providers found</p>
                )}
                {summary.mostConnected.map(node => (
                  <div key={node.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <NodeBadge type={node.type} label={node.label} />
                    <span className="text-white/30 font-mono text-xs">{node.id.slice(0, 8)}…</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Relationship types */}
          <Card className="bg-gray-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-semibold">Relationship Taxonomy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {["created", "assigned_to", "belongs_to", "covers", "holds", "opened", "linked_to", "renews"].map(rel => (
                  <div key={rel} className="flex items-center gap-2 py-1.5 px-2 rounded bg-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#CCFF00]" />
                    <span className="text-white/50 text-xs font-mono">{rel}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sample subgraph */}
        {sampleGraph && (
          <Card className="bg-gray-900 border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm font-semibold">Sample Subgraph</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {sampleGraph.nodes.length} nodes · {sampleGraph.edges.length} edges
                </Badge>
              </div>
              <p className="text-white/30 text-xs mt-1">Customer: {sampleCustomer?.full_name ?? sampleCustomer?.email ?? sampleCustomer?.id?.slice(0, 8)}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sampleGraph.edges.map((edge, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <NodeBadge type={edge.from.type} label={edge.from.label} />
                    <div className="flex items-center gap-1 text-white/20 text-xs">
                      <div className="w-6 h-px bg-white/20" />
                      <span className="font-mono">{edge.relationship}</span>
                      <div className="w-6 h-px bg-white/20" />
                      <span>→</span>
                    </div>
                    <NodeBadge type={edge.to.type} label={edge.to.label} />
                  </div>
                ))}
                {sampleGraph.edges.length === 0 && (
                  <p className="text-white/30 text-sm">No relationships found for this customer</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent customers for quick graph access */}
        <Card className="bg-gray-900 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm font-semibold">Customer Entity Index</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-white/5">
              {(recentCustomers.data ?? []).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <NodeBadge type="customer" label={(c.full_name as string | null) ?? (c.email as string | null) ?? "Customer"} />
                  <span className="text-white/20 font-mono text-xs">{c.id.slice(0, 12)}…</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
