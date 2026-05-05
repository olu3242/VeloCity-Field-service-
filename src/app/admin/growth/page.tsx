import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GrowthCharts } from "@/components/admin/growth-charts";
import { formatCents, SERVICE_CATEGORY_LABELS } from "@/lib/utils";
import {
  calculateDisputeRiskScore,
  calculateFranchiseReadinessScore,
  calculateTerritoryHealthScore,
} from "@/lib/scoring";
import { forecastDemand, forecastProviderSupply, forecastSlaRisk } from "@/lib/prediction";
import { analyzeSupplyGap, generateLaunchPlaybook } from "@/lib/expansion";
import { routeGrowthAutomationEvent } from "@/lib/automation/growthEvents";
import type { Job, Provider, ServiceArea, ServiceCategory } from "@/types";

const CATEGORIES = Object.keys(SERVICE_CATEGORY_LABELS) as ServiceCategory[];

export default async function AdminGrowthPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [{ data: jobs }, { data: providers }, { data: serviceAreas }, { data: disputes }, { data: agentLogs }] = await Promise.all([
    supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("providers").select("*").limit(300),
    supabase.from("service_areas").select("*").limit(50),
    supabase.from("disputes").select("*").limit(100),
    supabase.from("agent_logs").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  const jobRows = (jobs ?? []) as Job[];
  const providerRows = (providers ?? []) as Provider[];
  const areas = (serviceAreas ?? []) as ServiceArea[];
  const openJobs = jobRows.filter((job) => !["completed", "closed", "cancelled", "expired", "refunded"].includes(job.status));
  const completedJobs = jobRows.filter((job) => job.status === "completed" || job.status === "closed");
  const revenueCents = completedJobs.reduce((sum, job) => sum + (job.final_cost_cents ?? job.quoted_cost_cents ?? 0), 0);
  const disputeRate = jobRows.length ? (disputes?.length ?? 0) / jobRows.length : 0;

  const revenueByCategory = CATEGORIES.map((category) => ({
    category: SERVICE_CATEGORY_LABELS[category],
    revenue: Math.round(
      jobRows
        .filter((job) => job.category === category)
        .reduce((sum, job) => sum + (job.final_cost_cents ?? job.quoted_cost_cents ?? 0), 0) / 100
    ),
  })).filter((item) => item.revenue > 0).slice(0, 8);

  const territoryRows = (areas.length ? areas : [{ name: "Default Territory", city: "Austin", state: "TX", zip_codes: ["78701"], id: "default" } as ServiceArea]).map((area) => {
    const areaJobs = jobRows.filter((job) => job.city === area.city || area.zip_codes?.includes(job.zip ?? ""));
    const areaProviders = providerRows.filter((provider) => provider.status === "approved");
    const demand = forecastDemand({
      serviceArea: area.name,
      category: (areaJobs[0]?.category ?? "plumbing") as ServiceCategory,
      trailingJobs: areaJobs.length,
      providerCount: areaProviders.length,
    });
    const supply = forecastProviderSupply({ expectedJobs: demand.expectedJobs, activeProviders: areaProviders.length });
    const health = calculateTerritoryHealthScore({
      demandIndex: Math.min(100, demand.expectedJobs * 4),
      providerCount: areaProviders.length,
      activeCustomers: new Set(areaJobs.map((job) => job.customer_id)).size,
      completedJobs: areaJobs.filter((job) => job.status === "completed").length,
      revenueCents: areaJobs.reduce((sum, job) => sum + (job.final_cost_cents ?? job.quoted_cost_cents ?? 0), 0),
      disputeRate,
      slaHitRate: 0.86,
    });
    const franchise = calculateFranchiseReadinessScore({
      territoryHealthScore: health.score,
      monthlyRevenueCents: revenueCents,
      providerCount: areaProviders.length,
      activeCustomers: new Set(areaJobs.map((job) => job.customer_id)).size,
      disputeRate,
      monthOverMonthGrowth: 8,
      operatorCandidates: 1,
    });
    return { area, demand, supply, health, franchise };
  });

  const supplyGaps = CATEGORIES.map((category) => {
    const expectedJobs = jobRows.filter((job) => job.category === category).length + 4;
    const activeProviders = providerRows.filter((provider) => provider.status === "approved" && provider.categories?.includes(category)).length;
    return analyzeSupplyGap({ category, expectedJobs, activeProviders });
  }).filter((gap) => gap.providersNeeded > 0).slice(0, 6);

  const sla = forecastSlaRisk({
    openJobs: openJobs.length,
    activeProviders: providerRows.filter((provider) => provider.status === "approved" && provider.is_online).length,
    emergencyJobs: openJobs.filter((job) => job.urgency === "emergency").length,
  });

  const disputeRisk = calculateDisputeRiskScore({ jobRiskScore: sla.riskScore, quoteFairnessScore: 78, providerTrustScore: 74 });
  const playbook = generateLaunchPlaybook({
    city: territoryRows[0]?.area.city ?? "Austin",
    zipCodes: territoryRows[0]?.area.zip_codes ?? ["78701"],
    categories: supplyGaps.map((gap) => gap.category).slice(0, 3),
    providersNeeded: supplyGaps.reduce((sum, gap) => sum + gap.providersNeeded, 0),
  });

  const events = [
    routeGrowthAutomationEvent({
      type: "provider_shortage_detected",
      tenantId: profile.tenant_id ?? "unknown",
      severity: supplyGaps.length ? "high" : "low",
      payload: { supplyGaps },
      recommendations: ["Launch provider recruiting campaign in shortage categories."],
    }),
    routeGrowthAutomationEvent({
      type: "territory_ready_for_expansion",
      tenantId: profile.tenant_id ?? "unknown",
      severity: territoryRows.some((row) => row.franchise.score >= 70) ? "high" : "medium",
      payload: { territories: territoryRows.map((row) => ({ name: row.area.name, score: row.franchise.score })) },
      recommendations: ["Review top territory scorecards weekly."],
    }),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/admin/dashboard" className="text-lg font-bold text-velocity-700">VeloCity Growth</Link>
          <Button asChild variant="outline" size="sm"><Link href="/admin/dashboard">Command Center</Link></Button>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Growth Intelligence</h1>
            <p className="text-sm text-gray-500">Revenue, demand, supply, expansion, and franchise readiness.</p>
          </div>
          <Badge variant={sla.breachRisk === "high" ? "destructive" : "secondary"}>SLA Risk: {sla.breachRisk}</Badge>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{formatCents(revenueCents)}</div><div className="text-sm text-gray-500">Tracked Revenue</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{openJobs.length}</div><div className="text-sm text-gray-500">Open Jobs</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{supplyGaps.reduce((sum, gap) => sum + gap.providersNeeded, 0)}</div><div className="text-sm text-gray-500">Providers Needed</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{territoryRows[0]?.franchise.score ?? 0}</div><div className="text-sm text-gray-500">Top Franchise Score</div></CardContent></Card>
        </div>

        <div className="mb-6">
          <GrowthCharts
            revenueByCategory={revenueByCategory.length ? revenueByCategory : [{ category: "Plumbing", revenue: 0 }]}
            demandForecast={territoryRows.map((row) => ({ area: row.area.name, expectedJobs: row.demand.expectedJobs, providersNeeded: row.supply.providersNeeded }))}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Provider Supply Gaps</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {supplyGaps.map((gap) => (
                <div key={gap.category} className="flex items-center justify-between rounded-md border p-3">
                  <div><div className="font-medium">{SERVICE_CATEGORY_LABELS[gap.category]}</div><div className="text-xs text-gray-500">{gap.explanation}</div></div>
                  <Badge variant={gap.severity === "high" ? "destructive" : "secondary"}>{gap.providersNeeded} needed</Badge>
                </div>
              ))}
              {!supplyGaps.length && <div className="text-sm text-gray-500">No provider gaps detected.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Expansion Areas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {territoryRows.map((row) => (
                <div key={row.area.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{row.area.name}</div>
                    <Badge>{row.franchise.score}/100</Badge>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{row.demand.explanation}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Retention & Risk</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3"><div className="text-2xl font-bold">{disputeRisk.score}</div><div className="text-sm text-gray-500">Dispute Risk Score</div></div>
              <div className="rounded-md border p-3"><div className="text-2xl font-bold">{sla.riskScore}</div><div className="text-sm text-gray-500">SLA Breach Risk</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>AI Recommendations Feed</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {events.map((event) => (
                <div key={event.type} className="rounded-md border p-3">
                  <div className="flex items-center justify-between"><span className="font-medium">{event.type.replace(/_/g, " ")}</span><Badge variant="outline">{event.queue}</Badge></div>
                  <div className="mt-1 text-xs text-gray-500">{event.recommendations.join(" ")}</div>
                </div>
              ))}
              {agentLogs?.map((log) => <div key={log.id} className="text-xs text-gray-500">Agent {log.agent_name}: {log.action}</div>)}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader><CardTitle>Launch Playbook</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {playbook.checklist.map((item) => <div key={item} className="rounded-md bg-gray-100 p-3 text-sm">{item}</div>)}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
