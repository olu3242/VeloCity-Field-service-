import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, ArrowUpRight, Banknote, Clock, Map as MapIcon, ShieldCheck, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";
import {
  buildExecutiveSummary,
  buildRecommendedActions,
  calculateAutomationHealthScore,
  calculateMarketplaceHealthScore,
  calculateOpsHealthScore,
  calculateRevenueHealthScore,
  type CommandCenterMetrics,
} from "@/lib/command-center";
import { calculateRetentionProbabilityScore, calculateTerritoryHealthScore } from "@/lib/scoring";
import { calculateCommission } from "@/lib/revenue";
import { analyzeSupplyGap } from "@/lib/expansion";
import { getTenantId } from "@/lib/tenancy";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import type { Job, Payment, Provider, ServiceCategory } from "@/types";
import { computeRecurringRevenueIntelligence } from "@/lib/membership/membershipRevenueIntelligence";
import { computeMembershipRetentionIntelligence } from "@/lib/membership/membershipRetentionIntelligence";
import { computeCommercialRevenueIntelligence } from "@/lib/commercial/commercialRevenueIntelligence";
import { computeExecutiveIntelligence } from "@/lib/governance/executiveIntelligence";

interface AgentLogRow {
  id: string;
  agent_name: string;
  action: string | null;
  error: string | null;
  latency_ms: number | null;
  created_at: string;
}

interface AgentActivitySummary {
  name: string;
  capability: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  successRatePct: number | null;
  lastExecutionAt: string | null;
  avgRuntimeMs: number | null;
}

function buildAgentActivitySummary(agentLogs: AgentLogRow[]): AgentActivitySummary[] {
  return Object.values(AGENT_REGISTRY).map((registration) => {
    const logs = agentLogs.filter((log) => log.agent_name === registration.name);
    const failureCount = logs.filter((log) => Boolean(log.error)).length;
    const executionCount = logs.length;
    const runtimes = logs.map((log) => log.latency_ms).filter((ms): ms is number => typeof ms === "number");
    const lastExecutionAt = logs
      .map((log) => log.created_at)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;
    return {
      name: registration.name,
      capability: registration.capability_type,
      executionCount,
      successCount: executionCount - failureCount,
      failureCount,
      successRatePct: executionCount ? Math.round(((executionCount - failureCount) / executionCount) * 100) : null,
      lastExecutionAt,
      avgRuntimeMs: runtimes.length ? Math.round(runtimes.reduce((sum, ms) => sum + ms, 0) / runtimes.length) : null,
    };
  });
}

const DONE_STATUSES = ["completed", "closed"];
const INACTIVE_STATUSES = ["completed", "closed", "cancelled", "expired", "refunded"];

function levelVariant(level: string): "success" | "warning" | "destructive" | "secondary" {
  if (level === "low") return "success";
  if (level === "medium") return "warning";
  if (level === "high" || level === "critical") return "destructive";
  return "secondary";
}

function buildFallbackMetrics(): CommandCenterMetrics {
  return {
    gmvCents: 0,
    netRevenueCents: 0,
    commissionRevenueCents: 0,
    averageJobValueCents: 0,
    activeJobs: 0,
    unassignedJobs: 0,
    slaBreaches: 0,
    paymentFailures: 0,
    payoutQueue: 0,
    disputes: 0,
    providerSupplyGaps: 0,
    churnRisk: 45,
    territoryReadiness: 50,
    aiAgentActivity: 0,
    failedAutomations: 0,
    pricingFlags: 0,
    payoutHolds: 0,
    refundRisk: 0,
    revenueLeakageAlerts: 0,
    activeProviders: 0,
    totalProviders: 0,
    completedJobs: 0,
  };
}

export default async function AdminCommandCenterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const [
    { data: jobs },
    { data: providers },
    { data: payments },
    { data: disputes },
    { data: agentLogs },
    { data: serviceAreas },
    { data: automationQueue },
    { data: pricingDecisions },
    { data: payoutLedger },
    { data: refundRecords },
    { data: accessAudits },
    { data: settingsAudits },
    { data: personaAssignments },
    { data: profiles },
    { data: serviceTypes },
    { data: auditLogs },
    { data: providerSkills },
    { data: providerCertifications },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500),
    supabase.from("providers").select("*").eq("tenant_id", tenantId).limit(500),
    supabase.from("payments").select("*").eq("tenant_id", tenantId).limit(500),
    supabase.from("disputes").select("*").eq("tenant_id", tenantId).limit(200),
    supabase.from("agent_logs").select("id,agent_name,action,error,latency_ms,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500),
    supabase.from("service_areas").select("*").eq("tenant_id", tenantId).limit(50),
    supabase.from("automation_queue").select("id,status,retry_count,error_message,event_type,processed_at,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("pricing_decisions").select("id,status,risk_flags,confidence_score,final_price,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("payout_ledger").select("id,status,retry_count,amount,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("refund_records").select("id,status,amount,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("access_audit_logs").select("id,decision,persona_key,object_key,action_key,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("settings_audit_logs").select("id,setting_type,setting_key,action,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
    supabase.from("persona_assignments").select("id,user_id,personas(key,name)").eq("tenant_id", tenantId).eq("is_active", true).limit(200),
    supabase.from("profiles").select("id,role,created_at").eq("tenant_id", tenantId).limit(200),
    supabase.from("service_types").select("id,name,category").eq("tenant_id", tenantId).eq("is_active", true).limit(200),
    supabase.from("audit_logs").select("id,action,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    supabase.from("provider_skills").select("skill_tier,proficiency_score").eq("tenant_id", tenantId).limit(2000),
    supabase.from("provider_certifications").select("category,tier,is_active").eq("tenant_id", tenantId).eq("is_active", true).limit(1000),
  ]);

  // Membership Revenue + Retention Intelligence (Batch X+2, Phase 10):
  // delegates entirely to FINN's/ALICE's membership intelligence modules —
  // no new revenue or retention engine, same read-time pattern as Provider
  // Excellence Intelligence above.
  const [recurringRevenue, membershipRetention] = await Promise.all([
    computeRecurringRevenueIntelligence(),
    computeMembershipRetentionIntelligence(),
  ]);

  // Expansion Intelligence + Commercial Accounts (Batch X+3, Phase 10):
  // delegates entirely to FINN's commercial revenue module and GABRIEL's
  // executive briefing (which itself only reads the reports above plus
  // market_opportunities) — no new dashboard, no new revenue engine.
  const [commercialRevenue, executiveBriefing] = await Promise.all([
    computeCommercialRevenueIntelligence(),
    computeExecutiveIntelligence(),
  ]);

  const jobRows = (jobs ?? []) as Job[];
  const providerRows = (providers ?? []) as Provider[];
  const paymentRows = (payments ?? []) as Payment[];
  const completedJobs = jobRows.filter((job) => DONE_STATUSES.includes(job.status));
  const activeJobs = jobRows.filter((job) => !INACTIVE_STATUSES.includes(job.status));
  const unassignedJobs = activeJobs.filter((job) => !job.provider_id);
  const gmvCents = completedJobs.reduce((sum, job) => sum + (job.final_cost_cents ?? job.quoted_cost_cents ?? 0), 0);
  const commissionRevenueCents = completedJobs.reduce((sum, job) => {
    const amount = job.final_cost_cents ?? job.quoted_cost_cents ?? 0;
    return sum + calculateCommission(job.category, amount).platformFeeCents;
  }, 0);
  const failedPayments = paymentRows.filter((payment) => payment.status === "failed");
  const pricingRows = pricingDecisions ?? [];
  const payoutRows = payoutLedger ?? [];
  const refundRows = refundRecords ?? [];
  const pricingFlags = pricingRows.filter((decision) => {
    const flags = Array.isArray(decision.risk_flags) ? decision.risk_flags : [];
    return decision.status === "flagged" || flags.length > 0 || Number(decision.confidence_score ?? 100) < 70;
  });
  const payoutHolds = payoutRows.filter((payout) => payout.status === "payout_hold" || payout.status === "held" || payout.status === "failed");
  const refundRisk = refundRows.filter((refund) => refund.status !== "refunded" || Number(refund.amount ?? 0) > 0);
  const revenueLeakageAlerts = pricingRows.filter((decision) => {
    const flags = Array.isArray(decision.risk_flags) ? decision.risk_flags.map(String) : [];
    return flags.some((flag: string) => flag.includes("underpricing") || flag.includes("low"));
  });
  const deniedAccessAttempts = (accessAudits ?? []).filter((log) => log.decision === "denied");
  const personaCounts = new Map<string, number>();
  (personaAssignments ?? []).forEach((assignment) => {
    const persona = assignment.personas as { name?: string; key?: string } | null;
    const label = persona?.name ?? persona?.key ?? "Unassigned";
    personaCounts.set(label, (personaCounts.get(label) ?? 0) + 1);
  });
  const inactiveUsers = Math.max(0, (profiles?.length ?? 0) - (personaAssignments?.length ?? 0));
  const highRiskUsers = deniedAccessAttempts.filter((log) => {
    const createdAt = new Date(log.created_at).getTime();
    return Number.isFinite(createdAt) && Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000;
  }).length;
  const failedAutomations = (automationQueue ?? []).filter((item) => item.status === "failed" || Boolean(item.error_message));
  const automationRows = automationQueue ?? [];
  const pendingAutomations = automationRows.filter((item) => item.status === "pending");
  const completedAutomations = automationRows.filter((item) => item.status === "completed");
  const retryTotal = automationRows.reduce((sum, item) => sum + Number(item.retry_count ?? 0), 0);
  const lastProcessedAutomation = automationRows
    .filter((item) => item.processed_at)
    .sort((a, b) => String(b.processed_at).localeCompare(String(a.processed_at)))[0];
  const payoutQueue = paymentRows.filter((payment) => payment.status === "escrowed" || payment.status === "captured");
  const activeProviders = providerRows.filter((provider) => provider.status === "approved" && provider.is_online);
  const totalProviders = providerRows.length;
  const supplyGaps = (["plumbing", "electrical", "hvac", "cleaning", "handyman"] as ServiceCategory[])
    .map((category) =>
      analyzeSupplyGap({
        category,
        expectedJobs: Math.max(3, activeJobs.filter((job) => job.category === category).length + 4),
        activeProviders: providerRows.filter((provider) => provider.status === "approved" && provider.categories?.includes(category)).length,
      })
    )
    .filter((gap) => gap.providersNeeded > 0);

  const retention = calculateRetentionProbabilityScore({
    daysSinceLastJob: completedJobs.length ? 21 : 90,
    completedJobs: completedJobs.length,
    openDisputes: disputes?.length ?? 0,
    recurringCategory: true,
  });
  const territory = calculateTerritoryHealthScore({
    demandIndex: Math.min(100, activeJobs.length * 6 + 20),
    providerCount: activeProviders.length,
    activeCustomers: new Set(jobRows.map((job) => job.customer_id)).size,
    completedJobs: completedJobs.length,
    revenueCents: gmvCents,
    disputeRate: jobRows.length ? (disputes?.length ?? 0) / jobRows.length : 0,
    slaHitRate: 0.86,
  });

  const metrics: CommandCenterMetrics = jobRows.length || providerRows.length || paymentRows.length
    ? {
        gmvCents,
        netRevenueCents: commissionRevenueCents,
        commissionRevenueCents,
        averageJobValueCents: completedJobs.length ? Math.round(gmvCents / completedJobs.length) : 0,
        activeJobs: activeJobs.length,
        unassignedJobs: unassignedJobs.length,
        slaBreaches: activeJobs.filter((job) => job.urgency === "emergency" && !job.provider_id).length,
        paymentFailures: failedPayments.length,
        payoutQueue: payoutQueue.length,
        disputes: disputes?.length ?? 0,
        providerSupplyGaps: supplyGaps.length,
        churnRisk: Math.max(0, 100 - retention.score),
        territoryReadiness: territory.score,
        aiAgentActivity: agentLogs?.length ?? 0,
        failedAutomations: failedAutomations.length,
        pricingFlags: pricingFlags.length,
        payoutHolds: payoutHolds.length,
        refundRisk: refundRisk.length,
        revenueLeakageAlerts: revenueLeakageAlerts.length,
        activeProviders: activeProviders.length,
        totalProviders,
        completedJobs: completedJobs.length,
      }
    : buildFallbackMetrics();

  const agentActivity = buildAgentActivitySummary((agentLogs ?? []) as AgentLogRow[]);

  // Service Catalog: revenue and job-count breakdown by configured service
  // type, plus how much completed volume is still category-only (no service
  // type selected), reusing the same in-memory aggregation pattern as the
  // rest of this dashboard rather than a new reporting table.
  const serviceTypeRows = serviceTypes ?? [];
  const serviceTypeNameById = new Map(serviceTypeRows.map((st) => [st.id, st.name]));
  const serviceTypeCategoryById = new Map(serviceTypeRows.map((st) => [st.id, st.category]));
  const serviceTypeBreakdownMap = new Map<string, { jobs: number; revenueCents: number }>();
  let unclassifiedJobs = 0;
  let unclassifiedRevenueCents = 0;
  completedJobs.forEach((job) => {
    const amount = job.final_cost_cents ?? job.quoted_cost_cents ?? 0;
    if (!job.service_type_id) {
      unclassifiedJobs += 1;
      unclassifiedRevenueCents += amount;
      return;
    }
    const existing = serviceTypeBreakdownMap.get(job.service_type_id) ?? { jobs: 0, revenueCents: 0 };
    existing.jobs += 1;
    existing.revenueCents += amount;
    serviceTypeBreakdownMap.set(job.service_type_id, existing);
  });
  const serviceTypeBreakdown = Array.from(serviceTypeBreakdownMap.entries())
    .map(([serviceTypeId, stats]) => ({
      serviceTypeId,
      name: serviceTypeNameById.get(serviceTypeId) ?? "Unknown service type",
      category: serviceTypeCategoryById.get(serviceTypeId) ?? "—",
      ...stats,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  // System Health (Batch X, Phase 7): reuses data already queried above —
  // no new dashboard, no new tables, just additional aggregation over the
  // existing agent_logs / automation_queue / jobs / audit_logs result sets.
  const agentExecutionTotal = agentActivity.reduce((sum, agent) => sum + agent.executionCount, 0);
  const agentFailureTotal = agentActivity.reduce((sum, agent) => sum + agent.failureCount, 0);
  const agentHealth = {
    totalAgents: agentActivity.length,
    activeAgents: agentActivity.filter((agent) => agent.executionCount > 0).length,
    executionVolume: agentExecutionTotal,
    successRatePct: agentExecutionTotal ? Math.round(((agentExecutionTotal - agentFailureTotal) / agentExecutionTotal) * 100) : null,
    failureRatePct: agentExecutionTotal ? Math.round((agentFailureTotal / agentExecutionTotal) * 100) : null,
  };

  const workflowThroughput = completedJobs.length + activeJobs.length;
  const workflowHealth = {
    throughput: workflowThroughput,
    successRatePct: workflowThroughput ? Math.round((completedJobs.length / workflowThroughput) * 100) : null,
    unassigned: unassignedJobs.length,
    slaBreaches: metrics.slaBreaches,
  };

  const eventHealth = {
    volume: automationRows.length,
    successRatePct: automationRows.length ? Math.round((completedAutomations.length / automationRows.length) * 100) : null,
    failureRatePct: automationRows.length ? Math.round((failedAutomations.length / automationRows.length) * 100) : null,
    retries: retryTotal,
  };

  // Database Health references the static, file-evidenced findings in
  // docs/velocity/DATABASE_DECOMMISSION_AUDIT.md rather than a live
  // information_schema query (no live row-count connection available from
  // this dashboard); the orphaned-table count is a known constant, not a
  // live metric.
  const databaseHealth = {
    orphanedTables: 18,
    activeCoreTables: 9,
  };

  const evidenceHealth = {
    agentLogVolume: agentLogs?.length ?? 0,
    auditLogVolume: auditLogs?.length ?? 0,
    accessAuditVolume: accessAudits?.length ?? 0,
  };

  // Provider Excellence Intelligence (Batch X+1, Phase 9): reuses the
  // existing parallel query set plus the two new provider_skills/
  // provider_certifications queries above — no new dashboard, computed
  // entirely from real evidence rows written by computeProviderSkill()/
  // evaluateProviderCertification() (rex-completion.ts) and the existing
  // pricing_decisions/jobs/providers result sets already loaded.
  const skillRows = providerSkills ?? [];
  const skillTierCounts = skillRows.reduce(
    (acc: Record<string, number>, row: { skill_tier: string }) => {
      acc[row.skill_tier] = (acc[row.skill_tier] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const skillsIntelligence = {
    totalSkillRows: skillRows.length,
    tierCounts: skillTierCounts,
    avgProficiencyScore: skillRows.length
      ? Math.round(
          (skillRows.reduce((sum: number, row: { proficiency_score: number }) => sum + row.proficiency_score, 0) /
            skillRows.length) *
            100
        ) / 100
      : null,
  };

  const certRows = providerCertifications ?? [];
  const certTierCounts = certRows.reduce(
    (acc: Record<string, number>, row: { tier: string }) => {
      acc[row.tier] = (acc[row.tier] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const categoriesWithGoldOrElite = new Set(
    certRows
      .filter((row: { tier: string }) => row.tier === "gold" || row.tier === "elite")
      .map((row: { category: string }) => row.category)
  );
  const allCategories = new Set(serviceTypeRows.map((st) => st.category));
  const categoriesWithoutCommercialCoverage = Array.from(allCategories).filter(
    (category) => !categoriesWithGoldOrElite.has(category)
  );
  const certificationIntelligence = {
    activeCertCount: certRows.length,
    tierCounts: certTierCounts,
    categoriesWithoutCommercialCoverage,
  };

  const trustScores = providerRows.map((p) => p.trust_score ?? 0).filter((n) => Number.isFinite(n));
  const qualityIntelligence = {
    avgTrustScore: trustScores.length ? Math.round((trustScores.reduce((s, n) => s + n, 0) / trustScores.length) * 100) / 100 : null,
    providersAtRisk: providerRows.filter((p) => (p.trust_score ?? 0) < 0.6).length,
  };

  const quoteIntelligence = {
    avgConfidenceScore: pricingRows.length
      ? Math.round(pricingRows.reduce((sum, d) => sum + Number(d.confidence_score ?? 0), 0) / pricingRows.length)
      : null,
    flaggedQuotes: pricingFlags.length,
  };

  const growthIntelligence = {
    openSupplyGapCategories: supplyGaps.length,
    categoriesNeedingCommercialCertification: categoriesWithoutCommercialCoverage.length,
  };

  const ops = calculateOpsHealthScore(metrics);
  const revenue = calculateRevenueHealthScore(metrics);
  const automation = calculateAutomationHealthScore(metrics);
  const marketplace = calculateMarketplaceHealthScore(metrics);
  const summary = buildExecutiveSummary({ metrics, ops, revenue, automation, marketplace });
  const actions = buildRecommendedActions(metrics);

  const kpis = [
    { label: "GMV", value: formatCents(metrics.gmvCents), icon: Banknote },
    { label: "Net Revenue", value: formatCents(metrics.netRevenueCents), icon: ArrowUpRight },
    { label: "Commission Revenue", value: formatCents(metrics.commissionRevenueCents), icon: Banknote },
    { label: "Average Job Value", value: formatCents(metrics.averageJobValueCents), icon: Activity },
    { label: "Active Jobs", value: String(metrics.activeJobs), icon: Clock },
    { label: "Unassigned Jobs", value: String(metrics.unassignedJobs), icon: AlertTriangle },
    { label: "SLA Breaches", value: String(metrics.slaBreaches), icon: AlertTriangle },
    { label: "Payment Failures", value: String(metrics.paymentFailures), icon: AlertTriangle },
    { label: "Payout Queue", value: String(metrics.payoutQueue), icon: Banknote },
    { label: "Disputes", value: String(metrics.disputes), icon: ShieldCheck },
    { label: "Supply Gaps", value: String(metrics.providerSupplyGaps), icon: Users },
    { label: "Churn Risk", value: `${metrics.churnRisk}/100`, icon: Users },
    { label: "Territory Readiness", value: `${metrics.territoryReadiness}/100`, icon: MapIcon },
    { label: "AI Activity", value: String(metrics.aiAgentActivity), icon: Zap },
    { label: "Failed Automations", value: String(metrics.failedAutomations), icon: AlertTriangle },
    { label: "Pricing Flags", value: String(metrics.pricingFlags), icon: AlertTriangle },
    { label: "Payout Holds", value: String(metrics.payoutHolds), icon: Banknote },
    { label: "Refund Risk", value: String(metrics.refundRisk), icon: ShieldCheck },
    { label: "Revenue Leakage", value: String(metrics.revenueLeakageAlerts), icon: ArrowUpRight },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/admin/dashboard" className="text-lg font-bold text-velocity-700">Velocity Command Center</Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link href="/admin/growth">Growth</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/admin/dashboard">Admin</Link></Button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Revenue + Operations Command Center</h1>
              <p className="mt-1 text-sm text-gray-500">{summary.narrative}</p>
            </div>
            <Badge variant={summary.riskPosture === "stable" ? "success" : summary.riskPosture === "watch" ? "warning" : "destructive"}>
              {summary.headline}
            </Badge>
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          {[
            { title: "Operations Health", score: ops },
            { title: "Revenue Health", score: revenue },
            { title: "Automation Health", score: automation },
            { title: "Marketplace Health", score: marketplace },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-500">{item.title}</div>
                  <Badge variant={levelVariant(item.score.level)}>{item.score.level}</Badge>
                </div>
                <div className="mt-3 text-4xl font-bold">{item.score.score}</div>
                <p className="mt-2 text-xs text-gray-500">{item.score.reasons[0]}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">System Health</h2>
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">Agent Health</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{agentHealth.activeAgents}/{agentHealth.totalAgents} active</div>
                <div className="text-xs text-gray-500">Volume: {agentHealth.executionVolume}</div>
                <div className="text-xs text-gray-500">
                  Success: {agentHealth.successRatePct === null ? "—" : `${agentHealth.successRatePct}%`} · Failure: {agentHealth.failureRatePct === null ? "—" : `${agentHealth.failureRatePct}%`}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Workflow Health</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>Throughput: {workflowHealth.throughput}</div>
                <div className="text-xs text-gray-500">Completion: {workflowHealth.successRatePct === null ? "—" : `${workflowHealth.successRatePct}%`}</div>
                <div className="text-xs text-gray-500">Unassigned: {workflowHealth.unassigned} · SLA breaches: {workflowHealth.slaBreaches}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Event Health</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>Volume: {eventHealth.volume}</div>
                <div className="text-xs text-gray-500">
                  Success: {eventHealth.successRatePct === null ? "—" : `${eventHealth.successRatePct}%`} · Failure: {eventHealth.failureRatePct === null ? "—" : `${eventHealth.failureRatePct}%`}
                </div>
                <div className="text-xs text-gray-500">Retries: {eventHealth.retries}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Database Health</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{databaseHealth.activeCoreTables} authoritative evidence tables</div>
                <div className="text-xs text-gray-500">{databaseHealth.orphanedTables} orphaned tables flagged (see Decommission Audit)</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Evidence Health</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>Agent logs: {evidenceHealth.agentLogVolume}</div>
                <div className="text-xs text-gray-500">Audit logs: {evidenceHealth.auditLogVolume} · Access audits: {evidenceHealth.accessAuditVolume}</div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Provider Excellence Intelligence</h2>
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">Skills Intelligence</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{skillsIntelligence.totalSkillRows} computed skill rows</div>
                <div className="text-xs text-gray-500">Avg proficiency: {skillsIntelligence.avgProficiencyScore ?? "—"}</div>
                <div className="text-xs text-gray-500">Expert: {skillsIntelligence.tierCounts.expert ?? 0} · Proficient: {skillsIntelligence.tierCounts.proficient ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Certification Intelligence</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{certificationIntelligence.activeCertCount} active certifications</div>
                <div className="text-xs text-gray-500">Gold: {certificationIntelligence.tierCounts.gold ?? 0} · Elite: {certificationIntelligence.tierCounts.elite ?? 0}</div>
                <div className="text-xs text-gray-500">{certificationIntelligence.categoriesWithoutCommercialCoverage.length} category(ies) without commercial-tier coverage</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Quality Intelligence</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>Avg trust score: {qualityIntelligence.avgTrustScore ?? "—"}</div>
                <div className="text-xs text-gray-500">{qualityIntelligence.providersAtRisk} provider(s) below 0.60 trust score</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Quote Intelligence</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>Avg quote confidence: {quoteIntelligence.avgConfidenceScore ?? "—"}</div>
                <div className="text-xs text-gray-500">{quoteIntelligence.flaggedQuotes} flagged quote(s)</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Provider Growth Intelligence</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{growthIntelligence.openSupplyGapCategories} open supply-gap categor(ies)</div>
                <div className="text-xs text-gray-500">{growthIntelligence.categoriesNeedingCommercialCertification} categor(ies) need commercial certification growth</div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Membership &amp; Recurring Revenue Intelligence</h2>
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">MRR / ARR</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{formatCents(recurringRevenue.mrrCents)} MRR</div>
                <div className="text-xs text-gray-500">{formatCents(recurringRevenue.arrCents)} ARR</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Renewal / Churn</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{recurringRevenue.renewalRate}% renewal rate</div>
                <div className="text-xs text-gray-500">{recurringRevenue.churnRate}% churn rate (90d)</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Expansion Revenue</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{formatCents(recurringRevenue.expansionRevenueCents)}</div>
                <div className="text-xs text-gray-500">Forecasted next period: {formatCents(recurringRevenue.forecastedNextPeriodRevenueCents)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Retention Workflows</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{membershipRetention.upcomingRenewals.length} upcoming renewal(s)</div>
                <div className="text-xs text-gray-500">{membershipRetention.atRiskMembers.length} at-risk member(s) · {membershipRetention.inactiveMembers.length} inactive</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Plan Profitability</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {!recurringRevenue.planProfitability.length ? (
                  <div className="text-xs text-gray-500">No active membership plans yet.</div>
                ) : (
                  recurringRevenue.planProfitability.slice(0, 3).map((plan) => (
                    <div key={plan.planId} className="text-xs text-gray-500">
                      {plan.planName}: {formatCents(plan.profitabilityCents)} ({plan.activeSubscriptions} active)
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Expansion &amp; Commercial Intelligence</h2>
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">Commercial Revenue</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{formatCents(commercialRevenue.totalCommercialRevenueCents)} realized</div>
                <div className="text-xs text-gray-500">{formatCents(commercialRevenue.activeContractValueCents)} active contract value</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">At-Risk Contracts</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{commercialRevenue.atRiskContracts.length} at risk</div>
                <div className="text-xs text-gray-500">{commercialRevenue.renewalPipeline.length} renewing within 30 days</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Expansion Pipeline</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{executiveBriefing.expansionPipeline.openOpportunityCount} open opportunit(ies)</div>
                <div className="text-xs text-gray-500">{formatCents(executiveBriefing.expansionPipeline.openOpportunityRevenueImpactCents)} expected impact</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Executive Briefing</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{formatCents(executiveBriefing.recurringRevenue.mrrCents + executiveBriefing.commercialRevenue.totalCommercialRevenueCents)} combined monthly</div>
                <div className="text-xs text-gray-500">Renewal {executiveBriefing.recurringRevenue.renewalRate}% · Churn {executiveBriefing.recurringRevenue.churnRate}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Retention Risk</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{executiveBriefing.retentionRisk.atRiskMemberCount} at-risk member(s)</div>
                <div className="text-xs text-gray-500">{executiveBriefing.retentionRisk.missedServiceCount} missed service(s)</div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <Icon className="h-4 w-4 text-gray-400" />
                    <span className="text-xs text-gray-400">live</span>
                  </div>
                  <div className="mt-3 text-xl font-bold">{kpi.value}</div>
                  <div className="text-xs text-gray-500">{kpi.label}</div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Automation Queue</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: "Pending", value: pendingAutomations.length },
                { label: "Completed", value: completedAutomations.length },
                { label: "Failed", value: failedAutomations.length },
                { label: "Retries", value: retryTotal },
              ].map((item) => (
                <div key={item.label} className="rounded-md border p-3">
                  <div className="text-2xl font-bold">{item.value}</div>
                  <div className="text-xs text-gray-500">{item.label}</div>
                </div>
              ))}
              <div className="col-span-2 rounded-md bg-gray-100 p-3 text-sm">
                <div className="font-medium">Last processed event</div>
                <div className="text-xs text-gray-500">
                  {lastProcessedAutomation ? `${lastProcessedAutomation.event_type} at ${lastProcessedAutomation.processed_at}` : "No processed automation events found."}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent Failed Events</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {failedAutomations.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.event_type}</span>
                    <Badge variant="destructive">{item.retry_count ?? 0} retries</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{item.error_message ?? "No error message captured."}</p>
                </div>
              ))}
              {!failedAutomations.length && <p className="text-sm text-gray-500">No failed automation events found.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent Agent Logs</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(agentLogs ?? []).slice(0, 5).map((log) => (
                <div key={log.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.agent_name}</span>
                    <Badge variant={log.error ? "destructive" : "secondary"}>{log.error ? "error" : "logged"}</Badge>
                  </div>
                  <div className="text-xs text-gray-500">{log.action}</div>
                </div>
              ))}
              {!agentLogs?.length && <p className="text-sm text-gray-500">No recent agent logs found.</p>}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Risk and Blocker Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ...ops.recommendations.map((item) => ({ item, source: "Ops" })),
                ...revenue.recommendations.map((item) => ({ item, source: "Revenue" })),
                ...automation.recommendations.map((item) => ({ item, source: "Automation" })),
                ...marketplace.recommendations.map((item) => ({ item, source: "Marketplace" })),
              ].slice(0, 8).map((alert) => (
                <div key={`${alert.source}-${alert.item}`} className="flex items-start justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">{alert.item}</div>
                    <div className="text-xs text-gray-500">Auditable source: {alert.source}</div>
                  </div>
                  <Badge variant="outline">{alert.source}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommended Next Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actions.map((action) => (
                <div key={action.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{action.title}</div>
                    <Badge variant={action.priority === "critical" || action.priority === "high" ? "destructive" : action.priority === "medium" ? "warning" : "secondary"}>
                      {action.priority}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{action.reason}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-gray-400">{action.auditEvent}</span>
                    {action.href && <Link href={action.href} className="font-medium text-velocity-700">Open</Link>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Security + Access</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Denied attempts", value: deniedAccessAttempts.length },
                { label: "Permission changes", value: settingsAudits?.length ?? 0 },
                { label: "Inactive/unassigned users", value: inactiveUsers },
                { label: "High-risk users", value: highRiskUsers },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-md bg-gray-100 p-3 text-sm">
                  <span>{item.label}</span>
                  <Badge variant={item.value ? "warning" : "secondary"}>{item.value}</Badge>
                </div>
              ))}
              <Button asChild className="mt-2 w-full" variant="outline"><Link href="/admin/settings/audit">Open Access Audit</Link></Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Users by Persona</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Array.from(personaCounts.entries()).slice(0, 6).map(([persona, count]) => (
                <div key={persona} className="flex items-center justify-between rounded-md bg-gray-100 p-3 text-sm">
                  <span>{persona}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {!personaCounts.size && <p className="text-sm text-gray-500">No persona assignments found.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent Settings Changes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(settingsAudits ?? []).slice(0, 5).map((log) => (
                <div key={log.id} className="rounded-md bg-gray-100 p-3 text-sm">
                  <div className="font-medium">{log.setting_type}: {log.setting_key}</div>
                  <div className="text-xs text-gray-500">{log.action}</div>
                </div>
              ))}
              {!settingsAudits?.length && <p className="text-sm text-gray-500">No settings changes found.</p>}
            </CardContent>
          </Card>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Provider Supply Gaps</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {supplyGaps.length ? supplyGaps.map((gap) => (
                <div key={gap.category} className="flex items-center justify-between rounded-md bg-gray-100 p-3 text-sm">
                  <span>{gap.category.replace("_", " ")}</span>
                  <Badge variant={gap.severity === "high" ? "destructive" : "warning"}>{gap.providersNeeded} needed</Badge>
                </div>
              )) : <p className="text-sm text-gray-500">No supply gaps detected.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Territory Expansion</CardTitle></CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{metrics.territoryReadiness}</div>
              <p className="mt-2 text-sm text-gray-500">
                Based on {serviceAreas?.length ?? 0} service areas, {metrics.activeProviders} online providers, and {metrics.completedJobs} completed jobs.
              </p>
              <Button asChild className="mt-4 w-full"><Link href="/admin/growth">Open Growth Dashboard</Link></Button>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6">
          <Card>
            <CardHeader><CardTitle>Service Catalog Revenue Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-gray-500">
                      <th className="py-2 pr-4">Service Type</th>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Completed Jobs</th>
                      <th className="py-2 pr-4">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceTypeBreakdown.map((row) => (
                      <tr key={row.serviceTypeId} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{row.name}</td>
                        <td className="py-2 pr-4 capitalize text-gray-600">{String(row.category).replace("_", " ")}</td>
                        <td className="py-2 pr-4">{row.jobs}</td>
                        <td className="py-2 pr-4">{formatCents(row.revenueCents)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 pr-4 text-gray-500">Unclassified (category only)</td>
                      <td className="py-2 pr-4 text-gray-500">—</td>
                      <td className="py-2 pr-4 text-gray-500">{unclassifiedJobs}</td>
                      <td className="py-2 pr-4 text-gray-500">{formatCents(unclassifiedRevenueCents)}</td>
                    </tr>
                  </tbody>
                </table>
                {!serviceTypeBreakdown.length && (
                  <p className="mt-3 text-sm text-gray-500">No completed jobs have a service type selected yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6">
          <Card>
            <CardHeader><CardTitle>AI Agent Activity</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-gray-500">
                      <th className="py-2 pr-4">Agent</th>
                      <th className="py-2 pr-4">Capability</th>
                      <th className="py-2 pr-4">Executions</th>
                      <th className="py-2 pr-4">Success Rate</th>
                      <th className="py-2 pr-4">Avg Runtime</th>
                      <th className="py-2 pr-4">Last Execution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentActivity.map((agent) => (
                      <tr key={agent.name} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{agent.name}</td>
                        <td className="py-2 pr-4 capitalize text-gray-600">{agent.capability}</td>
                        <td className="py-2 pr-4">{agent.executionCount}</td>
                        <td className="py-2 pr-4">
                          {agent.successRatePct === null ? (
                            <span className="text-gray-400">No runs yet</span>
                          ) : (
                            <Badge variant={agent.successRatePct >= 95 ? "success" : agent.successRatePct >= 80 ? "warning" : "destructive"}>
                              {agent.successRatePct}%
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-4">{agent.avgRuntimeMs !== null ? `${agent.avgRuntimeMs}ms` : "—"}</td>
                        <td className="py-2 pr-4 text-gray-500">
                          {agent.lastExecutionAt ? new Date(agent.lastExecutionAt).toLocaleString() : "Never"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
