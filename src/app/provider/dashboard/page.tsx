import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { OfferActions } from "@/components/jobs/offer-actions";
import { OnlineToggle } from "@/components/provider/online-toggle";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  SERVICE_CATEGORY_LABELS,
  formatCents,
  formatDateTime,
} from "@/lib/utils";
import type { Job } from "@/types";
import {
  calculateProviderTrustScore,
  calculateQuoteFairnessScore,
} from "@/lib/scoring";
import { recommendProviderPlan, forecastRevenue } from "@/lib/revenue";
import { analyzeSupplyGap } from "@/lib/expansion";
import { lena } from "@/lib/agents/lena";
import { quinn } from "@/lib/agents/quinn";
import { computeProviderGrowthIntelligence } from "@/lib/growth/providerGrowthIntelligence";
import { computeProviderMembershipWork } from "@/lib/membership/providerMembershipWork";

export default async function ProviderDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "provider") redirect("/dashboard");

  const { data: provider } = await supabase
    .from("providers")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!provider) redirect("/provider/apply");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: offers } = await supabase
    .from("provider_offers")
    .select("*, jobs(*)")
    .eq("provider_id", provider.id)
    .is("accepted_at", null)
    .is("rejected_at", null)
    .order("offered_at", { ascending: false });

  // Tips received
  const [
    { data: tips },
    { count: activePeerCount },
  ] = await Promise.all([
    supabase
      .from("provider_tips")
      .select("id, job_id, amount_cents, note, payment_status, created_at")
      .eq("provider_id", provider.id)
      .eq("payment_status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("providers")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("is_online", true),
  ]);

  const totalTipsCents = tips?.reduce((sum, t) => sum + (t.amount_cents ?? 0), 0) ?? 0;

  const activeJobs = jobs?.filter((j) =>
    ["accepted", "scheduled", "deposit_paid", "en_route", "arrived", "diagnosis_in_progress", "quote_approved", "in_progress"].includes(j.status)
  );

  const todayEarnings = jobs
    ?.filter((j) => {
      const today = new Date().toDateString();
      return j.status === "completed" && new Date(j.updated_at).toDateString() === today;
    })
    .reduce((sum, j) => sum + (j.final_cost_cents ?? 0), 0) ?? 0;

  const completedJobs = jobs?.filter((job) => job.status === "completed" || job.status === "closed") ?? [];
  const totalEarnings = completedJobs.reduce((sum, job) => sum + (job.final_cost_cents ?? job.quoted_cost_cents ?? 0), 0);
  const completionRate = jobs?.length ? Math.round((completedJobs.length / jobs.length) * 100) : 0;
  const onTimeRate = Math.max(60, Math.min(98, 82 + Math.round((provider.trust_score ?? 0.6) * 12)));
  const providerTrust = calculateProviderTrustScore({
    trustScore: provider.trust_score,
    completedJobs: provider.completed_jobs,
    cancellationRate: provider.cancellation_rate,
    responseTimeMinutes: provider.response_time_minutes,
    isApproved: provider.status === "approved",
  });
  const quoteFairness = calculateQuoteFairnessScore({
    totalCents: jobs?.find((job) => job.quoted_cost_cents)?.quoted_cost_cents ?? 25000,
  });
  const earningsForecast = forecastRevenue({
    territory: "Current service area",
    category: provider.categories?.[0] ?? "handyman",
    historicalRevenueCents: totalEarnings,
    jobCount: Math.max(completedJobs.length, 1),
    demandGrowthRate: 0.1,
  });
  const planRecommendation = recommendProviderPlan({
    completedJobs: provider.completed_jobs ?? completedJobs.length,
    trustScore: provider.trust_score ?? 0.5,
    monthlyRevenueCents: totalEarnings,
  });
  const recommendedCategory = Object.keys(SERVICE_CATEGORY_LABELS).find((category) => !provider.categories?.includes(category)) ?? "handyman";
  const supplyGap = analyzeSupplyGap({
    category: recommendedCategory as keyof typeof SERVICE_CATEGORY_LABELS,
    expectedJobs: Math.max(completedJobs.length + (activeJobs?.length ?? 0) + 4, 8),
    activeProviders: Math.max(activePeerCount ?? 1, 1),
  });

  // Provider Excellence (Batch X+1, Phase 10): skills/certifications read
  // directly from the evidence tables computed by computeProviderSkill()/
  // evaluateProviderCertification() on every job completion; learning,
  // revenue, expansion, and quality recommendations are computed live by
  // LENA/QUINN/the growth intelligence module — nothing here is hardcoded.
  const [{ data: providerSkills }, { data: providerCertifications }, growthPath, qualityReport, growthIntelligence, membershipWork] =
    await Promise.all([
      supabase
        .from("provider_skills")
        .select("service_type_id, skill_tier, proficiency_score, completed_jobs_count, average_rating, service_types(name)")
        .eq("provider_id", provider.id),
      supabase
        .from("provider_certifications")
        .select("category, tier, is_active, awarded_at")
        .eq("provider_id", provider.id)
        .eq("is_active", true),
      lena.recommendGrowthPath(provider.id),
      quinn.assessQuality(provider.id),
      computeProviderGrowthIntelligence(provider.id),
      computeProviderMembershipWork(provider.id),
    ]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-xl text-[#CCFF00]">⚡ VeloCity</Link>
          <div className="flex items-center gap-1 text-xs">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400">Provider</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <OnlineToggle providerId={provider.id} isOnline={provider.is_online} />
          <span className="text-sm text-white/60">{profile?.full_name}</span>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Provider Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/provider/business">Business Profile</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/provider/earnings">Earnings</Link></Button>
            {provider.status !== "approved" && (
              <Badge variant="warning">Status: {provider.status}</Badge>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard variant="dark" label="New Offers" value={offers?.length ?? 0} valueClassName="text-velocity-700" />
          <StatCard variant="dark" label="Active Jobs" value={activeJobs?.length ?? 0} />
          <StatCard variant="dark" label="Today's Earnings" value={formatCents(todayEarnings)} valueClassName="text-green-700" />
          <StatCard variant="dark" label="Trust Score" value={`${(provider.trust_score * 100).toFixed(0)}%`} />
        </div>

        {/* Growth Intelligence */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Growth Intelligence</h2>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{providerTrust.score}</div>
                <div className="text-sm text-gray-500">Trust Score</div>
                <div className="mt-2 text-xs text-gray-400">{providerTrust.recommendations[0]}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{completionRate}%</div>
                <div className="text-sm text-gray-500">Completion Rate</div>
                <div className="mt-2 text-xs text-gray-400">Keep cancellations below 3%.</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{onTimeRate}%</div>
                <div className="text-sm text-gray-500">On-Time Rate</div>
                <div className="mt-2 text-xs text-gray-400">Go online only when ready to accept work.</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{quoteFairness.score}</div>
                <div className="text-sm text-gray-500">Quote Fairness</div>
                <div className="mt-2 text-xs text-gray-400">{quoteFairness.recommendations[0]}</div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Earnings Forecast</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">{formatCents(earningsForecast.projectedRevenueCents)}</div>
                <p className="mt-2 text-sm text-gray-500">{earningsForecast.explanation}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Recommended Expansion</CardTitle></CardHeader>
              <CardContent>
                <Badge variant="secondary">{SERVICE_CATEGORY_LABELS[supplyGap.category]}</Badge>
                <p className="mt-2 text-sm text-gray-500">{supplyGap.explanation}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Upgrade Recommendation</CardTitle></CardHeader>
              <CardContent>
                <Badge>{planRecommendation.plan}</Badge>
                <p className="mt-2 text-sm text-gray-500">{planRecommendation.reason}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Provider Excellence */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Provider Excellence</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!providerSkills?.length ? (
                  <p className="text-sm text-gray-500">Complete jobs to build your skills graph.</p>
                ) : (
                  providerSkills.map((skill: any) => (
                    <div key={skill.service_type_id} className="flex items-center justify-between text-sm">
                      <span>{skill.service_types?.name ?? "Service"}</span>
                      <Badge variant="secondary">{skill.skill_tier} · {skill.completed_jobs_count} jobs</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Certifications</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!providerCertifications?.length ? (
                  <p className="text-sm text-gray-500">No active certifications yet — keep completing jobs to qualify.</p>
                ) : (
                  providerCertifications.map((cert: any) => (
                    <div key={cert.category} className="flex items-center justify-between text-sm">
                      <span>{SERVICE_CATEGORY_LABELS[cert.category as keyof typeof SERVICE_CATEGORY_LABELS] ?? cert.category}</span>
                      <Badge>{cert.tier}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Learning Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!growthPath.learning_path.length ? (
                  <p className="text-sm text-gray-500">No tier gaps detected.</p>
                ) : (
                  growthPath.learning_path.map((item) => (
                    <p key={item.service_type_id} className="text-sm text-gray-500">
                      <span className="font-medium text-gray-300">{item.service_type_name}:</span> {item.gap_summary}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Quality Improvement</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!qualityReport.riskAlerts.length ? (
                  <p className="text-sm text-gray-500">No quality risk alerts.</p>
                ) : (
                  qualityReport.riskAlerts.map((alert, idx) => (
                    <p key={idx} className="text-sm text-gray-500">{alert.reason}</p>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!growthIntelligence.pricingOpportunities.length ? (
                  <p className="text-sm text-gray-500">No pricing variance detected against the platform average.</p>
                ) : (
                  growthIntelligence.pricingOpportunities.map((op) => (
                    <p key={op.category} className="text-sm text-gray-500">{op.reason}</p>
                  ))
                )}
                <p className="text-sm font-medium text-green-700">
                  Expected revenue impact: {formatCents(growthIntelligence.expectedRevenueImpactCents)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Service Expansion Opportunities</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!growthIntelligence.serviceExpansionOpportunities.length ? (
                  <p className="text-sm text-gray-500">No unserved demand detected in your area.</p>
                ) : (
                  growthIntelligence.serviceExpansionOpportunities.map((op) => (
                    <p key={op.category} className="text-sm text-gray-500">{op.reason}</p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Membership Work (Batch X+2, Phase 9) */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Membership Work</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Recurring Customers</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{membershipWork.recurringCustomerCount}</p>
                <p className="text-sm text-gray-500">Active membership customers with upcoming work assigned to you</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Projected Membership Revenue</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCents(membershipWork.projectedMembershipRevenueCents)}</p>
                <p className="text-sm text-gray-500">Your payout share from completed membership-driven jobs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Upcoming Membership Jobs</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!membershipWork.upcomingMembershipJobs.length ? (
                  <p className="text-sm text-gray-500">No upcoming membership-driven jobs.</p>
                ) : (
                  membershipWork.upcomingMembershipJobs.slice(0, 5).map((job) => (
                    <p key={job.jobId} className="text-sm text-gray-500">
                      <span className="font-medium text-gray-300">{job.planName}:</span>{" "}
                      {SERVICE_CATEGORY_LABELS[job.category as keyof typeof SERVICE_CATEGORY_LABELS] ?? job.category}
                      {job.scheduledStart ? ` — ${formatDateTime(job.scheduledStart)}` : ""}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* New Offers */}
        {offers && offers.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">New Job Offers</h2>
            <div className="space-y-3">
              {offers.map((offer) => {
                const job = offer.jobs as unknown as Job;
                return (
                  <Card key={offer.id} className="border-velocity-200 bg-velocity-50">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">{SERVICE_CATEGORY_ICONS[job.category]}</span>
                        <div>
                          <div className="font-medium">{job.title}</div>
                          <div className="text-sm text-gray-500">
                            {job.city}, {job.state} • {job.urgency}
                          </div>
                          {offer.match_score && (
                            <div className="text-xs text-velocity-700 font-medium mt-0.5">
                              Match score: {(offer.match_score * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>
                      <OfferActions offerId={offer.id} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Jobs */}
        {activeJobs && activeJobs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Active Jobs</h2>
            <div className="space-y-3">
              {activeJobs.map((job: Job) => (
                <Link key={job.id} href={`/provider/jobs/${job.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{SERVICE_CATEGORY_ICONS[job.category]}</span>
                        <div>
                          <div className="font-medium">{job.title}</div>
                          <div className="text-sm text-gray-500">
                            {job.city}, {job.state} • {formatDateTime(job.scheduled_start ?? job.created_at)}
                          </div>
                        </div>
                      </div>
                      <Badge className={JOB_STATUS_COLORS[job.status]}>
                        {JOB_STATUS_LABELS[job.status]}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Jobs */}
        <div>
          <h2 className="text-lg font-semibold mb-4">All Jobs</h2>
          {!jobs?.length ? (
            <EmptyState
              variant="dark"
              icon="📋"
              title="No jobs yet"
              description="Make sure you're online to start receiving job offers in your area."
            />
          ) : (
            <div className="space-y-2">
              {jobs.map((job: Job) => (
                <Link key={job.id} href={`/provider/jobs/${job.id}`}>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 hover:border-[#CCFF00]/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <span>{SERVICE_CATEGORY_ICONS[job.category]}</span>
                      <div>
                        <div className="font-medium text-sm">{job.title}</div>
                        <div className="text-xs text-gray-400">{formatDateTime(job.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {job.final_cost_cents && (
                        <span className="text-sm font-medium text-green-700">{formatCents(job.final_cost_cents)}</span>
                      )}
                      <Badge className={JOB_STATUS_COLORS[job.status]}>
                        {JOB_STATUS_LABELS[job.status]}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
