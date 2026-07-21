// Multi-Agent Coordinator — routes analysis requests to specialist agents.
// Each specialist wraps existing intelligence functions and produces
// structured analysis with recommendations and confidence scores.
// No new AI API calls; all intelligence is deterministic from existing data.

import { getAdminClient } from "@/lib/supabase/admin";
import { computeExecutiveIntelligence } from "@/lib/governance/executiveIntelligence";
import { computeRecurringRevenueIntelligence } from "@/lib/membership/membershipRevenueIntelligence";
import { computeMembershipRetentionIntelligence } from "@/lib/membership/membershipRetentionIntelligence";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { storeEnterpriseMemory } from "@/lib/enterprise-memory";
import { computeProviderGrowthIntelligence } from "@/lib/growth/providerGrowthIntelligence";
import { calculateCityReadinessScore } from "@/lib/expansion/cityReadinessScore";
import { calculateTerritoryOpportunityScore } from "@/lib/expansion/territoryOpportunityScore";
import { forecastSlaRisk } from "@/lib/prediction/slaForecast";
import { computeCommercialRevenueIntelligence } from "@/lib/commercial/commercialRevenueIntelligence";

export type SpecialistAgentType =
  | "executive-advisor"
  | "customer-success"
  | "finance-agent"
  | "risk-analyst"
  | "compliance-agent"
  | "provider-coach"
  | "growth-strategist"
  | "dispatch-agent"
  | "franchise-advisor"
  | "commercial-advisor";

export interface AgentAnalysis {
  agent: SpecialistAgentType;
  confidence: number;
  summary: string;
  recommendations: string[];
  reasoning: string;
  metadata?: Record<string, unknown>;
}

export interface CoordinationResult {
  taskId: string;
  analyses: AgentAnalysis[];
  synthesizedRecommendation: string;
  overallConfidence: number;
  processingMs: number;
}

async function runExecutiveAdvisor(tenantId: string): Promise<AgentAnalysis> {
  const [intel, rec] = await Promise.all([
    computeExecutiveIntelligence(tenantId),
    computeRecurringRevenueIntelligence(tenantId),
  ]);

  const recommendations: string[] = [];
  if (rec.mrrCents < 100_000) recommendations.push("Accelerate membership acquisition to grow MRR above $1k baseline");
  if (rec.renewalRate < 80) recommendations.push(`Renewal rate ${rec.renewalRate.toFixed(1)}% below 80% target — activate retention campaigns`);
  if (intel.retentionRisk.atRiskMemberCount > 0) recommendations.push(`${intel.retentionRisk.atRiskMemberCount} at-risk members need executive attention`);
  if (intel.expansionPipeline.openOpportunityCount > 0) recommendations.push(`${intel.expansionPipeline.openOpportunityCount} territory expansion opportunities identified`);
  if (recommendations.length === 0) recommendations.push("Revenue metrics healthy — focus on margin optimization");

  return {
    agent: "executive-advisor",
    confidence: 82,
    summary: `MRR $${(rec.mrrCents / 100).toFixed(0)}, ARR $${(rec.arrCents / 100).toFixed(0)}, renewal ${rec.renewalRate.toFixed(1)}%`,
    recommendations,
    reasoning: "Derived from recurring revenue intelligence and executive financial aggregates",
    metadata: { mrrCents: rec.mrrCents, arrCents: rec.arrCents, renewalRate: rec.renewalRate },
  };
}

async function runCustomerSuccessAgent(tenantId: string): Promise<AgentAnalysis> {
  const retention = await computeMembershipRetentionIntelligence(tenantId);
  const highRisk = retention.atRiskMembers.filter(m => m.churnRiskLevel === "high");
  const urgentRenewals = retention.upcomingRenewals.filter(r => r.daysUntilRenewal <= 7);

  const recommendations: string[] = [];
  if (highRisk.length > 0) recommendations.push(`${highRisk.length} high-churn-risk members need immediate outreach`);
  if (urgentRenewals.length > 0) recommendations.push(`${urgentRenewals.length} memberships renewing within 7 days — send reminders`);
  if (retention.inactiveMembers.length > 5) recommendations.push(`${retention.inactiveMembers.length} inactive members — schedule wellness calls`);
  if (recommendations.length === 0) recommendations.push("Membership health is stable — maintain current engagement cadence");

  return {
    agent: "customer-success",
    confidence: 88,
    summary: `${highRisk.length} high-risk, ${urgentRenewals.length} urgent renewals, ${retention.inactiveMembers.length} inactive`,
    recommendations,
    reasoning: "Derived from membership retention intelligence and churn risk scoring",
    metadata: { atRiskCount: highRisk.length, urgentRenewals: urgentRenewals.length },
  };
}

async function runFinanceAgent(tenantId: string): Promise<AgentAnalysis> {
  const db = getAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [revenueResult, payoutsResult, disputesResult] = await Promise.all([
    db.from("revenue_records").select("gross_amount_cents, platform_fee_cents")
      .eq("tenant_id", tenantId).gte("created_at", thirtyDaysAgo),
    db.from("payouts").select("amount_cents, status").eq("tenant_id", tenantId).eq("status", "pending"),
    db.from("disputes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "open"),
  ]);

  const gmv = (revenueResult.data ?? []).reduce((s, r) => s + ((r.gross_amount_cents as number) ?? 0), 0);
  const fees = (revenueResult.data ?? []).reduce((s, r) => s + ((r.platform_fee_cents as number) ?? 0), 0);
  const pendingPayouts = (payoutsResult.data ?? []).reduce((s, p) => s + ((p.amount_cents as number) ?? 0), 0);
  const openDisputes = disputesResult.count ?? 0;

  const recommendations: string[] = [];
  if (pendingPayouts > 1_000_000) recommendations.push(`$${(pendingPayouts / 100).toFixed(0)} in pending payouts — review release schedule`);
  if (openDisputes > 5) recommendations.push(`${openDisputes} open disputes may impact revenue — prioritize resolution`);
  if (gmv > 0 && fees / gmv < 0.1) recommendations.push("Platform fee margin below 10% — review pricing structure");
  if (recommendations.length === 0) recommendations.push("Financial metrics are within healthy ranges");

  return {
    agent: "finance-agent",
    confidence: 85,
    summary: `30d GMV $${(gmv / 100).toFixed(0)}, fees $${(fees / 100).toFixed(0)}, pending payouts $${(pendingPayouts / 100).toFixed(0)}`,
    recommendations,
    reasoning: "Derived from revenue records, payout ledger, and dispute data",
    metadata: { gmv, fees, pendingPayouts, openDisputes },
  };
}

async function runRiskAnalyst(tenantId: string): Promise<AgentAnalysis> {
  const circuits = getAllCircuits();
  const openCircuits = Object.entries(circuits).filter(([, s]) => s.state === "open");
  const db = getAdminClient();

  const [highRiskProviders, atRiskContracts] = await Promise.all([
    db.from("providers").select("id").eq("tenant_id", tenantId)
      .or("trust_score.lt.40,cancellation_rate.gte.0.15").limit(10),
    db.from("commercial_contracts").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "at_risk"),
  ]);

  const recommendations: string[] = [];
  if (openCircuits.length > 0) recommendations.push(`${openCircuits.length} circuit breaker(s) open: ${openCircuits.map(([n]) => n).join(", ")}`);
  if ((highRiskProviders.data?.length ?? 0) > 0) recommendations.push(`${highRiskProviders.data!.length} providers with degraded trust/cancellation metrics`);
  if ((atRiskContracts.count ?? 0) > 0) recommendations.push(`${atRiskContracts.count} at-risk commercial contracts`);
  if (recommendations.length === 0) recommendations.push("No critical risk signals — system operating within normal parameters");

  return {
    agent: "risk-analyst",
    confidence: 79,
    summary: `${openCircuits.length} open circuits, ${highRiskProviders.data?.length ?? 0} at-risk providers, ${atRiskContracts.count ?? 0} at-risk contracts`,
    recommendations,
    reasoning: "Derived from circuit breaker state, provider trust scores, and commercial contract health",
    metadata: { openCircuits: openCircuits.map(([n]) => n) },
  };
}

async function runComplianceAgent(tenantId: string): Promise<AgentAnalysis> {
  const db = getAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [auditResult, errorResult] = await Promise.all([
    db.from("audit_logs").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", thirtyDaysAgo),
    db.from("agent_logs").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).not("error", "is", null).gte("created_at", thirtyDaysAgo),
  ]);

  const auditCount = auditResult.count ?? 0;
  const errorCount = errorResult.count ?? 0;

  const recommendations: string[] = [];
  if (errorCount > 10) recommendations.push(`${errorCount} agent errors in last 30 days — review automation health`);
  if (auditCount < 50) recommendations.push("Low audit log volume — verify automation event emission");
  if (errorCount === 0 && auditCount >= 50) recommendations.push("Compliance posture healthy — all events audited, zero errors");

  return {
    agent: "compliance-agent",
    confidence: 75,
    summary: `${auditCount} audit events, ${errorCount} agent errors (30d)`,
    recommendations,
    reasoning: "Derived from audit_logs volume and agent_logs error rates",
    metadata: { auditCount, errorCount },
  };
}

async function runProviderCoach(tenantId: string): Promise<AgentAnalysis> {
  const db = getAdminClient();
  const { data: topProvider } = await db
    .from("providers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .order("trust_score", { ascending: false })
    .limit(1)
    .single();

  const recommendations: string[] = [];
  if (!topProvider) {
    recommendations.push("No approved providers found — prioritize provider onboarding");
    return { agent: "provider-coach", confidence: 60, summary: "No providers available", recommendations, reasoning: "No approved providers in tenant" };
  }

  const report = await computeProviderGrowthIntelligence(topProvider.id);
  if (report.revenueOpportunities.length > 0) recommendations.push(`${report.revenueOpportunities.length} revenue growth opportunities identified for top providers`);
  if (report.pricingOpportunities.length > 0) recommendations.push(`${report.pricingOpportunities.length} pricing misalignments — review rate card`);
  if (report.geographicExpansionOpportunities.length > 0) recommendations.push(`${report.geographicExpansionOpportunities.length} geographic expansion zones with unmet demand`);
  if (report.expectedRevenueImpactCents > 0) recommendations.push(`Estimated $${(report.expectedRevenueImpactCents / 100).toFixed(0)} uplift from coaching opportunities`);
  if (recommendations.length === 0) recommendations.push("Provider portfolio healthy — maintain current coaching cadence");

  return {
    agent: "provider-coach",
    confidence: 80,
    summary: `${report.revenueOpportunities.length} revenue opps, ${report.pricingOpportunities.length} pricing gaps, $${(report.expectedRevenueImpactCents / 100).toFixed(0)} potential uplift`,
    recommendations,
    reasoning: "Derived from provider growth intelligence: revenue trends, pricing benchmarks, and geographic demand gaps",
    metadata: { expectedRevenueImpactCents: report.expectedRevenueImpactCents },
  };
}

async function runGrowthStrategist(tenantId: string): Promise<AgentAnalysis> {
  const db = getAdminClient();
  const { data: territories } = await db
    .from("franchise_territories")
    .select("id, city, state, provider_count, active_customers, monthly_revenue_cents")
    .eq("tenant_id", tenantId)
    .limit(10);

  const recommendations: string[] = [];
  if (!territories || territories.length === 0) {
    recommendations.push("No franchise territories configured — define service territories to unlock expansion intelligence");
    return { agent: "growth-strategist", confidence: 60, summary: "No territories configured", recommendations, reasoning: "No franchise_territories rows for tenant" };
  }

  let highOpportunityCount = 0;
  for (const t of territories) {
    const readiness = calculateCityReadinessScore({
      demandIndex: Math.min(100, (t.active_customers as number ?? 0) * 2),
      providerCount: t.provider_count as number ?? 0,
      activeCustomers: t.active_customers as number ?? 0,
      monthlyRevenueCents: t.monthly_revenue_cents as number ?? 0,
    });
    const opportunity = calculateTerritoryOpportunityScore({
      demandIndex: Math.min(100, (t.active_customers as number ?? 0) * 2),
      providerGap: Math.max(0, 10 - (t.provider_count as number ?? 0)),
    });
    if (readiness.score >= 70 && opportunity.score >= 60) highOpportunityCount++;
  }

  if (highOpportunityCount > 0) recommendations.push(`${highOpportunityCount} territories show high readiness + opportunity for expansion`);
  if (territories.length < 3) recommendations.push("Fewer than 3 territories configured — consider multi-market expansion");
  const totalRevenue = territories.reduce((s, t) => s + ((t.monthly_revenue_cents as number) ?? 0), 0);
  if (totalRevenue > 0) recommendations.push(`Combined territory MRR $${(totalRevenue / 100).toFixed(0)} — benchmark against expansion cost models`);
  if (recommendations.length === 0) recommendations.push("Territory portfolio stable — monitor supply-gap signals for next expansion wave");

  return {
    agent: "growth-strategist",
    confidence: 78,
    summary: `${territories.length} territories, ${highOpportunityCount} high-opportunity, $${(territories.reduce((s, t) => s + ((t.monthly_revenue_cents as number) ?? 0), 0) / 100).toFixed(0)} MRR`,
    recommendations,
    reasoning: "Derived from city readiness and territory opportunity scoring across franchise territories",
    metadata: { territoryCount: territories.length, highOpportunityCount },
  };
}

async function runDispatchAgent(tenantId: string): Promise<AgentAnalysis> {
  const db = getAdminClient();
  const [openJobsResult, providersResult, emergencyResult] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["pending", "searching"]),
    db.from("providers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "approved"),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("urgency", "emergency").in("status", ["pending", "searching"]),
  ]);

  const openJobs = openJobsResult.count ?? 0;
  const activeProviders = providersResult.count ?? 0;
  const emergencyJobs = emergencyResult.count ?? 0;

  const forecast = forecastSlaRisk({ openJobs, activeProviders, emergencyJobs });
  const recommendations: string[] = [];
  if (forecast.breachRisk === "high") recommendations.push(`SLA breach risk HIGH (score ${forecast.riskScore}) — surge routing needed immediately`);
  else if (forecast.breachRisk === "medium") recommendations.push(`SLA breach risk MEDIUM (score ${forecast.riskScore}) — monitor dispatch queue`);
  if (emergencyJobs > 0) recommendations.push(`${emergencyJobs} emergency jobs in queue — prioritize provider matching`);
  if (activeProviders === 0) recommendations.push("No active providers — dispatch completely blocked");
  if (openJobs > activeProviders * 3) recommendations.push(`Queue depth ${openJobs} vs ${activeProviders} providers — acceptance rate at risk`);
  if (recommendations.length === 0) recommendations.push("Dispatch queue balanced — SLA risk within acceptable range");

  return {
    agent: "dispatch-agent",
    confidence: 83,
    summary: `${openJobs} open jobs, ${activeProviders} providers, ${emergencyJobs} emergency, SLA risk ${forecast.breachRisk}`,
    recommendations,
    reasoning: "Derived from live dispatch queue depth, provider availability, and SLA risk forecast",
    metadata: { openJobs, activeProviders, emergencyJobs, slaRiskScore: forecast.riskScore, breachRisk: forecast.breachRisk },
  };
}

async function runFranchiseAdvisor(tenantId: string): Promise<AgentAnalysis> {
  const db = getAdminClient();
  const [territoriesResult, operatorsResult] = await Promise.all([
    db.from("franchise_territories").select("id, city, state, status, monthly_revenue_cents").eq("tenant_id", tenantId),
    db.from("territory_operators").select("territory_id, status").eq("tenant_id", tenantId),
  ]);

  const territories = territoriesResult.data ?? [];
  const operators = operatorsResult.data ?? [];
  const unmanned = territories.filter(t => !operators.some((o: { territory_id: string; status: string }) => o.territory_id === t.id && o.status === "active"));
  const totalRevenue = territories.reduce((s, t) => s + ((t.monthly_revenue_cents as number) ?? 0), 0);

  const recommendations: string[] = [];
  if (unmanned.length > 0) recommendations.push(`${unmanned.length} territories without active operators — assign franchise leads`);
  if (territories.length === 0) recommendations.push("No franchise territories — configure territories to enable franchise intelligence");
  if (totalRevenue > 0 && territories.length > 0) {
    const avgRevenue = totalRevenue / territories.length;
    if (avgRevenue < 50000_00) recommendations.push(`Average territory MRR $${(avgRevenue / 100).toFixed(0)} below $50k target — accelerate territory activation`);
  }
  if (recommendations.length === 0) recommendations.push("Franchise portfolio healthy — all territories operational");

  return {
    agent: "franchise-advisor",
    confidence: 74,
    summary: `${territories.length} territories, ${unmanned.length} unmanned, $${(totalRevenue / 100).toFixed(0)} total MRR`,
    recommendations,
    reasoning: "Derived from franchise_territories and territory_operators coverage analysis",
    metadata: { territoryCount: territories.length, unmannedCount: unmanned.length, totalRevenueCents: totalRevenue },
  };
}

async function runCommercialAdvisor(tenantId: string): Promise<AgentAnalysis> {
  const report = await computeCommercialRevenueIntelligence(tenantId);
  const recommendations: string[] = [];
  if (report.atRiskContracts.length > 0) recommendations.push(`${report.atRiskContracts.length} commercial contracts at risk — schedule executive reviews`);
  if (report.renewalPipeline.length > 0) recommendations.push(`${report.renewalPipeline.length} contracts up for renewal — initiate renewal outreach`);
  if (report.totalCommercialRevenueCents < report.activeContractValueCents * 0.7) recommendations.push("Commercial revenue significantly below contracted value — investigate attainment gaps");
  if (recommendations.length === 0) recommendations.push("Commercial portfolio on track — maintain account health cadence");

  return {
    agent: "commercial-advisor",
    confidence: 81,
    summary: `$${(report.totalCommercialRevenueCents / 100).toFixed(0)} commercial revenue, ${report.atRiskContracts.length} at-risk, ${report.renewalPipeline.length} renewals pending`,
    recommendations,
    reasoning: "Derived from commercial revenue intelligence: contract attainment, at-risk contracts, and renewal pipeline",
    metadata: { totalCommercialRevenueCents: report.totalCommercialRevenueCents, atRiskCount: report.atRiskContracts.length },
  };
}

const AGENT_RUNNERS: Record<SpecialistAgentType, (tenantId: string) => Promise<AgentAnalysis>> = {
  "executive-advisor": runExecutiveAdvisor,
  "customer-success": runCustomerSuccessAgent,
  "finance-agent": runFinanceAgent,
  "risk-analyst": runRiskAnalyst,
  "compliance-agent": runComplianceAgent,
  "provider-coach": runProviderCoach,
  "growth-strategist": runGrowthStrategist,
  "dispatch-agent": runDispatchAgent,
  "franchise-advisor": runFranchiseAdvisor,
  "commercial-advisor": runCommercialAdvisor,
};

export async function coordinateAgents(
  tenantId: string,
  agentTypes: SpecialistAgentType[]
): Promise<CoordinationResult> {
  const start = Date.now();
  const taskId = `coord-${Date.now()}`;

  const analyses = await Promise.all(
    agentTypes.map(type => AGENT_RUNNERS[type](tenantId))
  );

  const overallConfidence = Math.round(
    analyses.reduce((s, a) => s + a.confidence, 0) / Math.max(analyses.length, 1)
  );

  const criticalRecs = analyses
    .flatMap(a => a.recommendations)
    .filter(r => r.toLowerCase().includes("risk") || r.toLowerCase().includes("open") || r.toLowerCase().includes("breach"));

  const synthesizedRecommendation = criticalRecs.length > 0
    ? `Priority: ${criticalRecs[0]}`
    : "All systems nominal — continue standard operating cadence";

  await storeEnterpriseMemory({
    tenantId,
    category: "recommendation",
    actorType: "agent",
    actorId: "coordinator",
    summary: synthesizedRecommendation,
    detail: { agents: agentTypes, overallConfidence },
    tags: ["multi-agent", "coordination"],
    importance: criticalRecs.length > 2 ? "high" : "normal",
  });

  return { taskId, analyses, synthesizedRecommendation, overallConfidence, processingMs: Date.now() - start };
}

export const ALL_SPECIALIST_AGENTS: SpecialistAgentType[] = [
  "executive-advisor", "customer-success", "finance-agent",
  "risk-analyst", "compliance-agent", "provider-coach",
  "growth-strategist", "dispatch-agent", "franchise-advisor", "commercial-advisor",
];
