import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantId } from "@/lib/tenancy";
import { coordinateAgents, ALL_SPECIALIST_AGENTS } from "@/lib/agents/coordinator";
import { isAgentEnabled } from "@/lib/governance/operator";
import { isOpen, getAllCircuits } from "@/lib/governance/circuit-breaker";

const AGENT_META: Record<string, { label: string; description: string; icon: string }> = {
  "executive-advisor": { label: "Executive Advisor", description: "Revenue, renewal, retention signals for executive decision making", icon: "📊" },
  "customer-success": { label: "Customer Success", description: "Churn risk, renewal urgency, and inactive member detection", icon: "💡" },
  "finance-agent": { label: "Finance Agent", description: "GMV, platform fees, pending payouts, and dispute revenue risk", icon: "💰" },
  "risk-analyst": { label: "Risk Analyst", description: "Circuit breaker state, provider trust degradation, contract risk", icon: "🛡️" },
  "compliance-agent": { label: "Compliance Agent", description: "Audit log volume, agent error rates, event emission health", icon: "✅" },
  "provider-coach": { label: "Provider Coach", description: "Provider performance scoring and improvement recommendations", icon: "🔧" },
  "growth-strategist": { label: "Growth Strategist", description: "Territory expansion signals and market opportunity analysis", icon: "🚀" },
  "dispatch-agent": { label: "Dispatch Agent", description: "Provider acceptance rates, dispatch queue health, SLA tracking", icon: "📡" },
};

function confidenceColor(c: number): string {
  if (c >= 85) return "text-green-400";
  if (c >= 70) return "text-yellow-400";
  return "text-orange-400";
}

export default async function AgentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const tenantId = getTenantId(profile);
  const circuits = getAllCircuits();

  // Run all specialist agents
  const coordination = await coordinateAgents(tenantId, ALL_SPECIALIST_AGENTS);

  // Build circuit lookup by key (getAllCircuits returns CircuitBreaker[])
  const circuitByKey = new Map(circuits.map(c => [c.key, c]));

  // Governance status for each agent
  const agentGovernance = ALL_SPECIALIST_AGENTS.map(type => ({
    type,
    enabled: isAgentEnabled(type),
    circuitOpen: isOpen(type),
    circuitState: circuitByKey.get(type)?.state ?? "closed",
  }));

  const enabledCount = agentGovernance.filter(a => a.enabled).length;
  const healthyCount = agentGovernance.filter(a => a.enabled && !a.circuitOpen).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Multi-Agent Intelligence</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/executive" className="text-white/40 hover:text-white">Executive OS</Link>
          <Link href="/admin/intelligence" className="text-white/40 hover:text-white">Intelligence</Link>
          <Link href="/admin/memory" className="text-white/40 hover:text-white">Memory</Link>
          <Link href="/admin/certification" className="text-white/40 hover:text-white">Certification</Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Multi-Agent Intelligence</h1>
            <p className="text-white/40 text-sm mt-1">Coordinated specialist analysis across {ALL_SPECIALIST_AGENTS.length} agents</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-[#CCFF00]">{coordination.overallConfidence}%</div>
            <p className="text-white/30 text-xs">overall confidence</p>
          </div>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Agents Active", value: `${healthyCount}/${ALL_SPECIALIST_AGENTS.length}` },
            { label: "Analysis Time", value: `${coordination.processingMs}ms` },
            { label: "Task ID", value: coordination.taskId.replace("coord-", "").slice(-6) },
            { label: "Confidence", value: `${coordination.overallConfidence}%` },
          ].map(s => (
            <Card key={s.label} className="bg-gray-900 border-white/10">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Synthesized recommendation */}
        <Card className="bg-[#CCFF00]/5 border-[#CCFF00]/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-[#CCFF00]" />
              <p className="text-[#CCFF00] text-xs font-semibold uppercase tracking-wider">Synthesized Recommendation</p>
            </div>
            <p className="text-white/80 text-sm">{coordination.synthesizedRecommendation}</p>
          </CardContent>
        </Card>

        {/* Agent analyses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coordination.analyses.map(analysis => {
            const meta = AGENT_META[analysis.agent];
            const gov = agentGovernance.find(g => g.type === analysis.agent);
            return (
              <Card key={analysis.agent} className="bg-gray-900 border-white/10">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{meta?.icon ?? "🤖"}</span>
                      <div>
                        <CardTitle className="text-white text-sm font-semibold">{meta?.label ?? analysis.agent}</CardTitle>
                        <p className="text-white/30 text-[10px] mt-0.5">{meta?.description ?? ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-lg font-black ${confidenceColor(analysis.confidence)}`}>{analysis.confidence}%</span>
                      {gov && !gov.enabled && <Badge variant="secondary" className="text-[10px]">disabled</Badge>}
                      {gov?.circuitOpen && <Badge variant="destructive" className="text-[10px]">circuit open</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-white/50 text-xs mb-3">{analysis.summary}</p>
                  <div className="space-y-1.5">
                    {analysis.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded bg-white/5">
                        <span className="text-[#CCFF00] text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-white/60 text-xs">{rec}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-white/20 text-[10px] mt-2 italic">{analysis.reasoning}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Agent registry */}
        <Card className="bg-gray-900 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm font-semibold">Agent Registry & Governance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-white/5">
              {agentGovernance.map(gov => {
                const meta = AGENT_META[gov.type];
                return (
                  <div key={gov.type} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span>{meta?.icon ?? "🤖"}</span>
                      <div>
                        <p className="text-white/70 text-sm">{meta?.label ?? gov.type}</p>
                        <p className="text-white/25 text-[10px] font-mono">{gov.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={gov.enabled ? "success" : "secondary"}
                        className="text-[10px]"
                      >
                        {gov.enabled ? "enabled" : "disabled"}
                      </Badge>
                      <Badge
                        variant={gov.circuitOpen ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {gov.circuitState}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
