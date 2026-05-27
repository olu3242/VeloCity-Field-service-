import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderDocumentsList, ProviderJobsList, ProviderPayoutsList, RelatedList } from "@/components/related-lists";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function AdminProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [
    { data: providerRaw },
    { data: jobsRaw },
    { data: tipsRaw },
    { data: reviewsRaw },
  ] = await Promise.all([
    supabase.from("providers")
      .select("*, profiles!providers_user_id_fkey(full_name, email, created_at)")
      .eq("id", id).single(),
    supabase.from("jobs")
      .select("id, title, status, category, final_cost_cents, created_at")
      .eq("provider_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("provider_tips")
      .select("amount_cents, created_at, payment_status")
      .eq("provider_id", id).eq("payment_status", "succeeded"),
    supabase.from("reviews")
      .select("rating, comment, created_at, job_id")
      .eq("provider_id", id).order("created_at", { ascending: false }).limit(10),
  ]);

  if (!providerRaw) notFound();

  const provider = providerRaw as unknown as ProviderData;
  const jobs = (jobsRaw ?? []) as unknown as JobRow[];
  const tips = (tipsRaw ?? []) as unknown as TipRow[];
  const reviews = (reviewsRaw ?? []) as unknown as ReviewRow[];

  const trustScore = Number(provider.trust_score ?? 0);
  const starCount = Math.round(trustScore);
  const stars = starCount > 0 ? "⭐".repeat(Math.min(starCount, 5)) : "—";

  const avgRating = reviews.length
    ? reviews.reduce((sum, r) => sum + Number(r.rating ?? 0), 0) / reviews.length
    : 0;

  const totalTips = tips.reduce((sum, t) => sum + (t.amount_cents ?? 0), 0);

  const completedJobs = jobs.filter(j =>
    ["customer_confirmed","completed","closed","refunded"].includes(j.status)
  );
  const totalEarned = completedJobs.reduce((sum, j) => sum + Math.round((j.final_cost_cents ?? 0) * 0.82), 0);
  const combinedTotal = totalEarned + totalTips;

  const statusBadgeColor = provider.status === "approved"
    ? "bg-green-800 text-green-200"
    : provider.status === "pending"
    ? "bg-yellow-800 text-yellow-200"
    : "bg-red-800 text-red-200";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/providers" className="text-sm text-white/50 hover:text-white/80 mb-3 inline-block">
            ← Back to Providers
          </Link>
          <h1 className="text-3xl font-bold">{provider.business_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadgeColor}`}>
              {provider.status}
            </span>
            <span className="text-sm text-white/60">{stars}</span>
            <span className="text-sm text-white/40">
              Joined {formatDateTime(provider.created_at)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Provider Info */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Provider Info</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                {provider.bio && (
                  <p className="text-white/70 italic">{provider.bio}</p>
                )}
                {provider.categories && provider.categories.length > 0 && (
                  <div>
                    <span className="text-white/50 text-xs uppercase tracking-wide">Categories</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {provider.categories.map(cat => (
                        <span key={cat} className="px-2 py-1 bg-white/10 rounded text-xs text-white/80">
                          {SERVICE_CATEGORY_ICONS[cat as ServiceCategory] ?? "🛠️"} {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-white/70">
                  <div><span className="text-white/40">Service Radius:</span> {provider.service_radius_miles ?? "—"} miles</div>
                  <div><span className="text-white/40">Hourly Rate:</span> {provider.hourly_rate_cents ? formatCents(provider.hourly_rate_cents) : "—"}/hr</div>
                  <div><span className="text-white/40">Years Experience:</span> {provider.years_experience ?? "—"}</div>
                  <div><span className="text-white/40">Business License:</span> {provider.business_license ?? "—"}</div>
                  <div><span className="text-white/40">Insurance #:</span> {provider.insurance_number ?? "—"}</div>
                  <div><span className="text-white/40">Insurance Expiry:</span> {provider.insurance_expiry ?? "—"}</div>
                </div>
              </CardContent>
            </Card>

            {/* Profile */}
            {provider.profiles && (
              <Card className="bg-white/5 border-white/10">
                <CardHeader><CardTitle className="text-white">Profile</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm text-white/70">
                  <div><span className="text-white/40">Full Name:</span> {provider.profiles.full_name}</div>
                  <div><span className="text-white/40">Email:</span> {provider.profiles.email}</div>
                </CardContent>
              </Card>
            )}

            {/* Recent Jobs */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Recent Jobs</CardTitle></CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <p className="text-sm text-white/40">No jobs yet.</p>
                ) : (
                  <div className="space-y-2">
                    {jobs.map(job => (
                      <Link
                        key={job.id}
                        href={`/admin/jobs/${job.id}`}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span>{SERVICE_CATEGORY_ICONS[job.category as ServiceCategory] ?? "🛠️"}</span>
                          <div>
                            <div className="text-sm font-medium text-white">{job.title}</div>
                            <div className="text-xs text-white/40">{formatDateTime(job.created_at)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${JOB_STATUS_COLORS[job.status as JobStatus] ?? "bg-gray-700 text-gray-200"}`}>
                            {JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}
                          </span>
                          <span className="text-sm text-white/60">{formatCents(job.final_cost_cents ?? 0)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reviews */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>Reviews</span>
                  {reviews.length > 0 && (
                    <span className="text-sm font-normal text-white/50">
                      Avg: {"★".repeat(Math.round(avgRating))}{"☆".repeat(5 - Math.round(avgRating))} ({avgRating.toFixed(1)})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reviews.length === 0 ? (
                  <p className="text-sm text-white/40">No reviews yet.</p>
                ) : reviews.map((review, i) => (
                  <div key={i} className="border border-white/10 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-yellow-400">
                        {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                      </span>
                      <span className="text-xs text-white/30">{formatDateTime(review.created_at)}</span>
                    </div>
                    {review.comment && (
                      <p className="text-sm text-white/60 italic">{review.comment}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Tips Received */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>Tips Received</span>
                  <span className="text-sm font-normal text-white/50">Total: {formatCents(totalTips)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tips.length === 0 ? (
                  <p className="text-sm text-white/40">No tips received.</p>
                ) : tips.map((tip, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border border-white/10 rounded-lg px-3 py-2">
                    <span className="text-emerald-400 font-medium">{formatCents(tip.amount_cents)}</span>
                    <span className="text-white/40">{formatDateTime(tip.created_at)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Approval Actions */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Approval Actions</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {provider.status === "pending" && (
                  <ProviderApprovalActions providerId={provider.id} />
                )}
                <ProviderStatusButton providerId={provider.id} currentStatus={provider.status} />
              </CardContent>
            </Card>

            {/* Trust Score */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Trust Score</CardTitle></CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-velocity-400">
                  {(trustScore * 100).toFixed(0)}%
                </div>
                <p className="text-xs text-white/40 mt-2">
                  Based on job completion rate, customer ratings, and response time.
                </p>
              </CardContent>
            </Card>

            {/* Earnings Summary */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Earnings Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/50">Job Earnings (82%)</span>
                  <span className="text-white font-medium">{formatCents(totalEarned)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Tips</span>
                  <span className="text-emerald-400 font-medium">{formatCents(totalTips)}</span>
                </div>
                <div className="text-xs text-gray-500">{formatDateTime(payout.created_at)}</div>
              </div>
            ))}
            {!payouts?.length && <p className="text-sm text-gray-500">No payout records found.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <ProviderJobsList tenantId={tenantId} providerId={provider.id} />
        <ProviderDocumentsList tenantId={tenantId} providerId={provider.id} />
        <RelatedList title="Provider Availability" table="provider_availability" tenantId={tenantId} filters={[{ column: "provider_id", value: provider.id }]} primaryColumn="day_of_week" statusColumn="is_active" secondaryColumn="start_time" />
        <RelatedList title="Provider Reviews" table="reviews" tenantId={tenantId} filters={[{ column: "reviewee_id", value: provider.user_id }]} primaryColumn="comment" statusColumn="rating" />
        <ProviderPayoutsList tenantId={tenantId} providerId={provider.id} />
        <RelatedList title="Provider Disputes" table="disputes" tenantId={tenantId} filters={[{ column: "against", value: provider.user_id }]} primaryColumn="reason" statusColumn="status" href={(row) => `/admin/disputes/${row.id}`} />
      </section>
    </main>
  );
}
