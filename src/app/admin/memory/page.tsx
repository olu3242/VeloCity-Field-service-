import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantId } from "@/lib/tenancy";
import { formatDateTime } from "@/lib/utils";
import { retrieveMemories, getMemoryStats } from "@/lib/enterprise-memory";
import type { MemoryCategory } from "@/lib/enterprise-memory";

const CATEGORY_STYLES: Record<string, string> = {
  decision: "bg-blue-500/20 text-blue-300",
  outcome: "bg-green-500/20 text-green-300",
  incident: "bg-red-500/20 text-red-300",
  lesson: "bg-yellow-500/20 text-yellow-300",
  recommendation: "bg-violet-500/20 text-violet-300",
  forecast: "bg-cyan-500/20 text-cyan-300",
};

const IMPORTANCE_STYLES: Record<string, string> = {
  low: "text-white/30",
  normal: "text-white/50",
  high: "text-yellow-400",
  critical: "text-red-400",
};

export default async function EnterprisMemoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const tenantId = getTenantId(profile);

  const [memories, stats] = await Promise.all([
    retrieveMemories(tenantId, { limit: 50 }),
    getMemoryStats(tenantId),
  ]);

  const categories: MemoryCategory[] = ["decision", "outcome", "incident", "lesson", "recommendation", "forecast"];
  const totalMemories = Object.values(stats).reduce((s, n) => s + n, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Enterprise Memory</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/knowledge-graph" className="text-white/40 hover:text-white">Knowledge Graph</Link>
          <Link href="/admin/agents" className="text-white/40 hover:text-white">Agents</Link>
          <Link href="/admin/certification" className="text-white/40 hover:text-white">Certification</Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Enterprise Memory</h1>
          <p className="text-white/40 text-sm mt-1">Long-lived organizational decisions, outcomes, and lessons</p>
        </div>

        {totalMemories === 0 && (
          <Card className="bg-gray-900 border-white/10">
            <CardContent className="py-12 text-center">
              <p className="text-white/40 text-sm">No memory entries yet.</p>
              <p className="text-white/25 text-xs mt-1">Memory is populated automatically as the multi-agent coordinator runs analysis.</p>
            </CardContent>
          </Card>
        )}

        {totalMemories > 0 && (
          <>
            {/* Category breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {categories.map(cat => (
                <Card key={cat} className="bg-gray-900 border-white/10">
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className={`text-2xl font-bold ${stats[cat] ? "text-white" : "text-white/20"}`}>
                      {stats[cat] ?? 0}
                    </div>
                    <Badge className={`mt-1 text-[10px] ${CATEGORY_STYLES[cat] ?? "bg-white/10 text-white/40"}`}>
                      {cat}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Memory timeline */}
            <Card className="bg-gray-900 border-white/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm font-semibold">Memory Timeline</CardTitle>
                  <Badge variant="secondary" className="text-xs">{totalMemories} entries</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {memories.map(entry => (
                    <div key={entry.id} className="flex items-start gap-4 py-3 border-b border-white/5 last:border-0">
                      <div className="shrink-0 text-right w-32">
                        <p className="text-white/25 text-[10px] font-mono">{formatDateTime(entry.created_at)}</p>
                        <p className={`text-[10px] font-semibold mt-0.5 ${IMPORTANCE_STYLES[entry.importance] ?? "text-white/40"}`}>
                          {entry.importance}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge className={`text-[10px] shrink-0 ${CATEGORY_STYLES[entry.category] ?? "bg-white/10 text-white/40"}`}>
                            {entry.category}
                          </Badge>
                          {entry.actor_id && (
                            <span className="text-white/25 text-[10px] font-mono truncate">{entry.actor_id}</span>
                          )}
                          {entry.entity_type && (
                            <span className="text-white/20 text-[10px] truncate">{entry.entity_type}</span>
                          )}
                        </div>
                        <p className="text-white/70 text-sm leading-snug">{entry.summary}</p>
                        {entry.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {entry.tags.map(tag => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 font-mono">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Memory schema reference */}
        <Card className="bg-gray-900 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm font-semibold">Memory Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { cat: "decision", desc: "Executive and operational decisions recorded for future reference" },
                { cat: "outcome", desc: "Results of automation runs, agent actions, and business operations" },
                { cat: "incident", desc: "SLA breaches, disputes, circuit breaks, and operational failures" },
                { cat: "lesson", desc: "Learnings derived from incidents and outcomes for future guidance" },
                { cat: "recommendation", desc: "Agent-generated recommendations and coordinated intelligence outputs" },
                { cat: "forecast", desc: "Predictive signals, demand forecasts, and revenue projections" },
              ].map(({ cat, desc }) => (
                <div key={cat} className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                  <Badge className={`shrink-0 text-[10px] mt-0.5 ${CATEGORY_STYLES[cat] ?? ""}`}>{cat}</Badge>
                  <p className="text-white/40 text-xs">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
