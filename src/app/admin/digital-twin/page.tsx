import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantId } from "@/lib/tenancy";
import { formatCents } from "@/lib/utils";
import {
  syncDigitalTwin,
  getTwinHistory,
  runSimulation,
  type ScenarioType,
} from "@/lib/digital-twin";

const SCENARIO_TYPES: { type: ScenarioType; label: string; description: string }[] = [
  { type: "territory_expansion", label: "Territory Expansion", description: "Open a new service territory at 50% capacity" },
  { type: "pricing_increase", label: "Pricing Increase", description: "20% pricing increase across membership tiers" },
  { type: "provider_surge", label: "Provider Surge", description: "Double the provider pool via recruitment drive" },
  { type: "customer_churn", label: "Customer Churn", description: "30% customer churn scenario" },
  { type: "seasonal_spike", label: "Seasonal Spike", description: "Peak season demand 2× normal volume" },
  { type: "contract_loss", label: "Contract Loss", description: "Lose top commercial account" },
];

function slaColor(risk: string): string {
  if (risk === "low") return "text-green-400";
  if (risk === "medium") return "text-yellow-400";
  if (risk === "high") return "text-orange-400";
  return "text-red-400";
}

function slaBg(risk: string): string {
  if (risk === "low") return "bg-green-500";
  if (risk === "medium") return "bg-yellow-500";
  if (risk === "high") return "bg-orange-500";
  return "bg-red-500";
}

export default async function DigitalTwinPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const tenantId = getTenantId(profile);

  // Sync live state into digital twin
  const currentState = await syncDigitalTwin(tenantId);
  const history = await getTwinHistory(12);

  // Run all predefined scenarios at 0.5 magnitude
  const simulations = SCENARIO_TYPES.map(s =>
    runSimulation(currentState, { type: s.type, magnitude: 0.5, description: s.description })
  );

  const queueUtilization = Math.min(100, Math.round((currentState.queueDepth / Math.max(currentState.processingWorkers * 10, 1)) * 100));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Digital Twin</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/mission-control" className="text-white/40 hover:text-white">Mission Control</Link>
          <Link href="/admin/executive" className="text-white/40 hover:text-white">Executive OS</Link>
          <Link href="/admin/intelligence" className="text-white/40 hover:text-white">Intelligence</Link>
          <Link href="/admin/agents" className="text-white/40 hover:text-white">Agents</Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Enterprise Digital Twin</h1>
            <p className="text-white/40 text-sm mt-1">Real-time operational model · Last synced {new Date(currentState.timestamp).toLocaleTimeString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#CCFF00] animate-pulse" />
            <span className="text-[#CCFF00] text-sm font-medium">LIVE</span>
          </div>
        </div>

        {/* Current state */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Queue Depth", value: currentState.queueDepth.toLocaleString(), sub: `${currentState.processingWorkers} workers` },
            { label: "Active Providers", value: currentState.activeProviders.toLocaleString(), sub: "approved & online" },
            { label: "Open Disputes", value: currentState.disputeOpenCount.toLocaleString(), sub: "pending resolution" },
            { label: "Pending Payouts", value: formatCents(currentState.payoutPendingCents), sub: "awaiting release" },
            { label: "AI Calls/min", value: currentState.aiCallsPerMinute.toLocaleString(), sub: "automation events" },
            { label: "Queue Utilization", value: `${queueUtilization}%`, sub: "of worker capacity" },
          ].map(s => (
            <Card key={s.label} className="bg-gray-900 border-white/10">
              <CardContent className="pt-4 pb-3">
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-white/60 text-[10px] font-medium mt-0.5">{s.label}</p>
                <p className="text-white/25 text-[10px]">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* SLA risk indicator */}
        <Card className={`border ${currentState.slaBreachRisk === "low" ? "bg-green-500/5 border-green-500/20" : currentState.slaBreachRisk === "critical" ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/5 border-yellow-500/20"}`}>
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wide mb-1">SLA Breach Risk</p>
              <p className={`text-3xl font-black uppercase ${slaColor(currentState.slaBreachRisk)}`}>{currentState.slaBreachRisk}</p>
            </div>
            <div className="flex gap-2">
              {(["low", "medium", "high", "critical"] as const).map(level => (
                <div key={level} className="text-center">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${currentState.slaBreachRisk === level ? `${slaBg(level)} text-black` : "bg-white/5 text-white/20"}`}>
                    <span className="text-[10px] font-bold uppercase">{level[0]}</span>
                  </div>
                  <p className="text-[9px] text-white/20 mt-1 uppercase">{level}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* State history sparkline */}
        {history.length > 1 && (
          <Card className="bg-gray-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-semibold">Queue Depth History (last {history.length} snapshots)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-16">
                {history.map((snap, i) => {
                  const maxDepth = Math.max(...history.map(s => s.queueDepth), 1);
                  const heightPct = Math.max(4, Math.round((snap.queueDepth / maxDepth) * 100));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-sm ${snap.slaBreachRisk === "critical" ? "bg-red-500" : snap.slaBreachRisk === "high" ? "bg-orange-500" : snap.slaBreachRisk === "medium" ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-white/20 text-[10px]">{new Date(history[0]?.timestamp ?? "").toLocaleTimeString()}</span>
                <span className="text-white/20 text-[10px]">{new Date(history[history.length - 1]?.timestamp ?? "").toLocaleTimeString()}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scenario simulations */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4">What-If Simulations <span className="text-white/30 text-sm font-normal">(50% magnitude)</span></h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {simulations.map((sim, i) => {
              const scenarioMeta = SCENARIO_TYPES[i];
              const riskChanged = sim.impact.slaRiskChange !== "unchanged";
              const revenuePositive = sim.impact.revenueImpactCents >= 0;
              return (
                <Card key={scenarioMeta?.type} className="bg-gray-900 border-white/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm font-semibold">{scenarioMeta?.label}</CardTitle>
                    <p className="text-white/30 text-[10px]">{scenarioMeta?.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">Queue depth</span>
                        <span className={sim.impact.queueDepthChange > 0 ? "text-orange-400" : "text-green-400"}>
                          {sim.baseline.queueDepth} → {sim.projected.queueDepth}
                          {" "}({sim.impact.queueDepthChange >= 0 ? "+" : ""}{sim.impact.queueDepthChange})
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">SLA risk</span>
                        <span className={riskChanged ? "text-yellow-400" : "text-white/40"}>{sim.impact.slaRiskChange}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">Revenue impact</span>
                        <span className={revenuePositive ? "text-green-400" : "text-red-400"}>
                          {revenuePositive ? "+" : ""}{formatCents(sim.impact.revenueImpactCents)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">Confidence</span>
                        <span className="text-white/60">{sim.impact.confidence}%</span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2">
                      <p className="text-white/40 text-[10px]">{sim.recommendation}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
