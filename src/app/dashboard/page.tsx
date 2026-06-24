import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  formatCents,
  formatDateTime,
} from "@/lib/utils";
import type { Job } from "@/types";
import { computeCustomerMembershipSummary } from "@/lib/membership/customerMembershipSummary";
import { computeCommercialAccountSummary } from "@/lib/commercial/commercialAccountSummary";

export default async function CustomerDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin" || profile?.role === "super_admin") redirect("/admin/dashboard");
  if (profile?.role === "provider") redirect("/provider/dashboard");
  if (profile?.role === "dispatcher") redirect("/dispatch/dashboard");
  if (profile?.role === "franchise_owner") redirect("/franchise/dashboard");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const activeJobs = jobs?.filter((j) =>
    !["completed", "closed", "cancelled", "expired", "refunded"].includes(j.status)
  );

  const memberships = await computeCustomerMembershipSummary(user.id);

  // Commercial Account view (Batch X+3, Phase 11): extends this same
  // dashboard for customers who are also the primary contact of a
  // commercial account — no separate commercial portal.
  const { data: commercialAccountRow } = await supabase
    .from("commercial_accounts")
    .select("id")
    .eq("primary_contact_id", user.id)
    .maybeSingle();
  const commercialAccount = commercialAccountRow
    ? await computeCommercialAccountSummary(commercialAccountRow.id)
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Hi, {profile?.full_name?.split(" ")[0]}</span>
          <Button asChild>
            <Link href="/book">+ New Request</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Active Jobs"
            value={activeJobs?.length ?? 0}
            valueClassName="text-velocity-700"
          />
          <StatCard
            label="Completed"
            value={jobs?.filter((j) => j.status === "completed").length ?? 0}
          />
          <StatCard
            label="Total Spent"
            value={formatCents(
              jobs?.reduce((sum, j) => sum + (j.final_cost_cents ?? j.quoted_cost_cents ?? 0), 0) ?? 0
            )}
          />
        </div>

        {/* Memberships (Batch X+2, Phase 11) */}
        {memberships.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">My Memberships</h2>
            <div className="space-y-3">
              {memberships.map((m) => (
                <Card key={m.subscriptionId}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{m.planName}</div>
                      <Badge className={m.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                        {m.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500 mb-3">
                      {m.billingFrequency} billing • renews {formatDateTime(m.currentPeriodEnd)}
                      {m.nextServiceDate ? ` • next service ${m.nextServiceDate}` : ""}
                    </div>
                    <div className="space-y-1 mb-3">
                      {m.entitlements.map((e) => (
                        <div key={e.entitlementId} className="text-xs text-gray-500 flex items-center justify-between">
                          <span>
                            {e.serviceTypeName}
                            {e.isPriorityScheduling ? " (priority scheduling)" : ""}
                          </span>
                          <span>
                            {e.includedUsesPerPeriod === null
                              ? `${e.usedThisPeriod} used (unlimited)`
                              : `${e.usedThisPeriod}/${e.includedUsesPerPeriod} used`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm font-medium text-velocity-700">
                      Savings realized this period: {formatCents(m.savingsRealizedCents)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Commercial Account (Batch X+3, Phase 11) */}
        {commercialAccount && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">My Commercial Account</h2>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{commercialAccount.name}</div>
                  <Badge className={commercialAccount.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                    {commercialAccount.status}
                  </Badge>
                </div>
                <div className="text-sm text-gray-500 mb-3">
                  {commercialAccount.locationCount} location(s) · {commercialAccount.jobCount} job(s) · {formatCents(commercialAccount.realizedRevenueCents)} realized
                </div>
                <div className="space-y-3">
                  {commercialAccount.activeContracts.map((contract) => (
                    <div key={contract.contractId} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium capitalize">{contract.contractType.replace(/_/g, " ")} contract</span>
                        <Badge className={contract.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                          {contract.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatCents(contract.contractValueCents)} ({contract.billingFrequency}) · renews {contract.endDate ?? "ongoing"}
                      </div>
                      <div className="mt-2 space-y-1">
                        {contract.servicePlans.map((plan, i) => (
                          <div key={i} className="text-xs text-gray-500 flex items-center justify-between">
                            <span>{plan.serviceTypeName}</span>
                            <span>{plan.includedUsesPerPeriod === null ? "unlimited" : `${plan.includedUsesPerPeriod}/${plan.period}`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!commercialAccount.activeContracts.length && (
                    <p className="text-sm text-gray-500">No active contracts.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Active Jobs */}
        {activeJobs && activeJobs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Active Jobs</h2>
            <div className="space-y-3">
              {activeJobs.map((job: Job) => (
                <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">{SERVICE_CATEGORY_ICONS[job.category]}</span>
                        <div>
                          <div className="font-medium">{job.title}</div>
                          <div className="text-sm text-gray-500">
                            {job.city}, {job.state} • {formatDateTime(job.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {job.quoted_cost_cents && (
                          <span className="font-semibold">{formatCents(job.quoted_cost_cents)}</span>
                        )}
                        <Badge className={JOB_STATUS_COLORS[job.status]}>
                          {JOB_STATUS_LABELS[job.status]}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Jobs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">All Jobs</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/jobs">View all</Link>
            </Button>
          </div>

          {!jobs?.length ? (
            <EmptyState
              icon="🧰"
              title="No jobs yet"
              description="Book your first service and we'll match you with a verified local provider."
              action={{ label: "Book a Service", href: "/book" }}
            />
          ) : (
            <div className="space-y-2">
              {jobs.map((job: Job) => (
                <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
                  <div className="flex items-center justify-between rounded-lg border bg-white p-4 hover:border-velocity-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <span>{SERVICE_CATEGORY_ICONS[job.category]}</span>
                      <div>
                        <div className="font-medium text-sm">{job.title}</div>
                        <div className="text-xs text-gray-400">{formatDateTime(job.created_at)}</div>
                      </div>
                    </div>
                    <Badge className={JOB_STATUS_COLORS[job.status]}>
                      {JOB_STATUS_LABELS[job.status]}
                    </Badge>
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
