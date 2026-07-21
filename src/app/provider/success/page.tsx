import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

type SkillTier = "novice" | "competent" | "proficient" | "expert";

function tierBadge(tier: SkillTier) {
  if (tier === "expert") return "bg-[#CCFF00]/20 text-[#CCFF00] border-[#CCFF00]/30";
  if (tier === "proficient") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (tier === "competent") return "bg-green-500/20 text-green-400 border-green-500/30";
  return "bg-white/10 text-white/40 border-white/10";
}

function burnoutSignal(jobsPerWeek: number, avgJobsPerWeek: number) {
  if (avgJobsPerWeek === 0) return null;
  const ratio = jobsPerWeek / avgJobsPerWeek;
  if (ratio > 1.5) return { label: "High load", color: "text-orange-400" };
  if (ratio < 0.4) return { label: "Low activity", color: "text-yellow-400" };
  return null;
}

export default async function ProviderSuccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "provider") redirect("/dashboard");

  const { data: providerRow } = await supabase
    .from("providers")
    .select("id, business_name, trust_score, cancellation_rate, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!providerRow) redirect("/provider/apply");

  const adminClient = await createAdminClient();
  const providerId = providerRow.id;

  // 12-week lookback
  const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);

  const [jobsResult, revenueResult, reviewsResult, skillsResult, offersResult] = await Promise.all([
    adminClient
      .from("jobs")
      .select("id, status, category, created_at, final_cost_cents")
      .eq("provider_id", providerId)
      .gte("created_at", twelveWeeksAgo.toISOString())
      .order("created_at", { ascending: true }),
    adminClient
      .from("revenue_records")
      .select("provider_payout_cents, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", twelveWeeksAgo.toISOString())
      .order("created_at", { ascending: true }),
    adminClient
      .from("reviews")
      .select("rating, created_at, comment")
      .eq("reviewee_id", providerId)
      .order("created_at", { ascending: false })
      .limit(50),
    adminClient
      .from("provider_skills")
      .select("proficiency_score, skill_tier, completed_jobs_count, service_types(name)")
      .eq("provider_id", providerId)
      .order("proficiency_score", { ascending: false })
      .limit(5),
    adminClient
      .from("provider_offers")
      .select("id, accepted_at, rejected_at, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", twelveWeeksAgo.toISOString()),
  ]);

  type Job = { id: string; status: string; category: string; created_at: string; final_cost_cents: number | null };
  type Revenue = { provider_payout_cents: number | null; created_at: string };
  type Review = { rating: number; created_at: string; comment: string | null };
  type Skill = { proficiency_score: number; skill_tier: string; completed_jobs_count: number; service_types: { name: string } | null };
  type Offer = { id: string; accepted_at: string | null; rejected_at: string | null; created_at: string };

  const jobs = (jobsResult.data ?? []) as Job[];
  const revenueRows = (revenueResult.data ?? []) as Revenue[];
  const reviews = (reviewsResult.data ?? []) as Review[];
  const skills = (skillsResult.data ?? []) as unknown as Skill[];
  const offers = (offersResult.data ?? []) as Offer[];

  // Build weekly buckets (12 weeks)
  const weeks: Array<{ label: string; jobs: number; payout: number; rating: number | null }> = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
    const weekJobs = jobs.filter((j) => {
      const d = new Date(j.created_at);
      return d >= weekStart && d < weekEnd && ["completed", "customer_confirmed"].includes(j.status);
    });
    const weekRevenue = revenueRows
      .filter((r) => { const d = new Date(r.created_at); return d >= weekStart && d < weekEnd; })
      .reduce((s, r) => s + (r.provider_payout_cents ?? 0), 0);
    const weekReviews = reviews.filter((r) => { const d = new Date(r.created_at); return d >= weekStart && d < weekEnd; });
    const avgRating = weekReviews.length > 0 ? weekReviews.reduce((s, r) => s + r.rating, 0) / weekReviews.length : null;

    const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    weeks.push({ label, jobs: weekJobs.length, payout: weekRevenue, rating: avgRating ? Math.round(avgRating * 10) / 10 : null });
  }

  // Aggregates
  const totalPayout12w = revenueRows.reduce((s, r) => s + (r.provider_payout_cents ?? 0), 0);
  const totalCompleted12w = jobs.filter((j) => ["completed", "customer_confirmed"].includes(j.status)).length;
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const acceptanceRate = offers.length > 0 ? offers.filter((o) => o.accepted_at !== null).length / offers.length : null;

  // Monthly projection (annualize 12-week average)
  const avgWeeklyPayout = totalPayout12w / 12;
  const monthlyProjection = Math.round(avgWeeklyPayout * 4.33);

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  for (const j of jobs) {
    if (["completed", "customer_confirmed"].includes(j.status)) {
      categoryMap[j.category] = (categoryMap[j.category] ?? 0) + 1;
    }
  }
  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Burnout signal: last 2 weeks vs average
  const recentWeekJobs = weeks.slice(-2).reduce((s, w) => s + w.jobs, 0) / 2;
  const avgWeeklyJobs = totalCompleted12w / 12;
  const burnout = burnoutSignal(recentWeekJobs, avgWeeklyJobs);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-[#CCFF00]">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <Link href="/provider/dashboard" className="text-sm text-white/60 hover:text-white">Dashboard</Link>
          <Link href="/provider/earnings" className="text-sm text-white/60 hover:text-white">Earnings</Link>
          <Link href="/provider/skills" className="text-sm text-white/60 hover:text-white">Skills</Link>
          <Link href="/provider/notifications" className="text-sm text-white/60 hover:text-white">Notifications</Link>
          <span className="text-sm text-[#CCFF00]">Success</span>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Provider Success Center</h1>
            <p className="text-white/40 text-sm mt-1">
              {providerRow.business_name} · 12-week performance overview
            </p>
          </div>
          {burnout && (
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
              {burnout.label}
            </Badge>
          )}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "12-Week Earnings", value: formatCents(totalPayout12w), color: "text-[#CCFF00]" },
            { label: "Monthly Projection", value: formatCents(monthlyProjection), color: "text-green-400" },
            { label: "Jobs Completed", value: totalCompleted12w.toString(), color: "text-white" },
            { label: "Avg Rating", value: avgRating ? `${avgRating.toFixed(1)} ★` : "—", color: (avgRating ?? 0) >= 4.5 ? "text-[#CCFF00]" : (avgRating ?? 0) >= 4 ? "text-green-400" : "text-yellow-400" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Weekly earnings trend */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Weekly Earnings (12 weeks)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {weeks.map((w, i) => {
                  const maxPayout = Math.max(...weeks.map((wk) => wk.payout), 1);
                  const barPct = Math.round((w.payout / maxPayout) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-white/30 w-14 shrink-0">{w.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#CCFF00]"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className="text-white/60 w-16 text-right">{w.payout > 0 ? formatCents(w.payout) : "—"}</span>
                      <span className="text-white/30 w-4 text-center">{w.jobs > 0 ? w.jobs : ""}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Performance metrics */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Trust Score</div>
                  <div className={`font-bold text-2xl ${(providerRow.trust_score ?? 0) >= 80 ? "text-green-400" : (providerRow.trust_score ?? 0) >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                    {providerRow.trust_score ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Acceptance Rate</div>
                  <div className={`font-bold text-2xl ${(acceptanceRate ?? 0) >= 0.8 ? "text-green-400" : (acceptanceRate ?? 0) >= 0.6 ? "text-yellow-400" : "text-red-400"}`}>
                    {acceptanceRate !== null ? `${Math.round(acceptanceRate * 100)}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Cancellation Rate</div>
                  <div className={`font-bold text-lg ${(providerRow.cancellation_rate ?? 0) <= 0.05 ? "text-green-400" : (providerRow.cancellation_rate ?? 0) <= 0.1 ? "text-yellow-400" : "text-red-400"}`}>
                    {providerRow.cancellation_rate !== null ? `${Math.round(providerRow.cancellation_rate * 100)}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Avg Weekly Jobs</div>
                  <div className="font-bold text-lg">{avgWeeklyJobs.toFixed(1)}</div>
                </div>
              </div>

              {/* Rating trend (recent 5 reviews) */}
              {reviews.length > 0 && (
                <div className="border-t border-white/10 pt-3">
                  <div className="text-xs text-white/40 mb-2">Recent Ratings</div>
                  <div className="flex gap-1.5">
                    {reviews.slice(0, 10).map((r, i) => (
                      <div
                        key={i}
                        title={r.comment ?? undefined}
                        className={`h-6 w-6 rounded text-[10px] flex items-center justify-center font-semibold ${
                          r.rating >= 5 ? "bg-[#CCFF00]/20 text-[#CCFF00]" :
                          r.rating >= 4 ? "bg-green-500/20 text-green-400" :
                          r.rating >= 3 ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {r.rating}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Top job categories */}
          {topCategories.length > 0 && (
            <Card className="bg-gray-900 border-white/10 text-white">
              <CardHeader>
                <CardTitle className="text-sm">Top Service Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topCategories.map(([cat, count]) => {
                    const maxCount = topCategories[0][1];
                    return (
                      <div key={cat} className="flex items-center gap-2 text-xs">
                        <span className="text-white/60 w-36 capitalize truncate">{cat.replace(/_/g, " ")}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-[#CCFF00]" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                        </div>
                        <span className="text-white/40 w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Skills summary */}
          {skills.length > 0 && (
            <Card className="bg-gray-900 border-white/10 text-white">
              <CardHeader>
                <CardTitle className="text-sm">
                  Top Skills
                  <Link href="/provider/skills" className="ml-2 text-[10px] text-white/30 hover:text-[#CCFF00]">
                    Full skills view →
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {skills.map((skill, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-white/70">{skill.service_types?.name ?? "Unknown"}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white/40">{skill.completed_jobs_count} jobs</span>
                          <Badge className={tierBadge(skill.skill_tier as SkillTier)}>{skill.skill_tier}</Badge>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-[#CCFF00]" style={{ width: `${Math.min(skill.proficiency_score, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Promotion readiness */}
        <Card className="bg-gray-900 border-white/10 text-white">
          <CardHeader>
            <CardTitle className="text-sm">Promotion Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div className="rounded-md bg-white/5 px-3 py-2">
                <div className="text-white/40 text-xs mb-1">Trust Score</div>
                <div className={`font-semibold ${(providerRow.trust_score ?? 0) >= 80 ? "text-green-400" : "text-yellow-400"}`}>
                  {(providerRow.trust_score ?? 0) >= 80 ? "✓ Meets threshold" : `${providerRow.trust_score ?? 0}/80 needed`}
                </div>
              </div>
              <div className="rounded-md bg-white/5 px-3 py-2">
                <div className="text-white/40 text-xs mb-1">Cancellation</div>
                <div className={`font-semibold ${(providerRow.cancellation_rate ?? 0) <= 0.05 ? "text-green-400" : "text-red-400"}`}>
                  {(providerRow.cancellation_rate ?? 0) <= 0.05 ? "✓ Under 5%" : `${Math.round((providerRow.cancellation_rate ?? 0) * 100)}% (target: <5%)`}
                </div>
              </div>
              <div className="rounded-md bg-white/5 px-3 py-2">
                <div className="text-white/40 text-xs mb-1">Avg Rating</div>
                <div className={`font-semibold ${(avgRating ?? 0) >= 4.5 ? "text-green-400" : (avgRating ?? 0) >= 4 ? "text-yellow-400" : "text-red-400"}`}>
                  {avgRating !== null ? `${avgRating.toFixed(1)}/5.0` : "No ratings yet"}
                </div>
              </div>
              <div className="rounded-md bg-white/5 px-3 py-2">
                <div className="text-white/40 text-xs mb-1">Jobs (12w)</div>
                <div className={`font-semibold ${totalCompleted12w >= 10 ? "text-green-400" : "text-yellow-400"}`}>
                  {totalCompleted12w >= 10 ? `✓ ${totalCompleted12w} jobs` : `${totalCompleted12w}/10 needed`}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
