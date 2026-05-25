import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProviderApprovalActions } from "@/components/admin/provider-actions";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  formatCents,
  formatDateTime,
} from "@/lib/utils";
import type { Job } from "@/types";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  // Fetch KPI data
  const [
    { count: totalJobs },
    { count: activeJobs },
    { count: openDisputes },
    { count: pendingProviders },
    { data: recentJobs },
    { data: recentProviders },
    { data: recentTips },
  ] = await Promise.all([
    supabase.from("jobs").select("*", { count: "exact", head: true }),
    supabase.from("jobs").select("*", { count: "exact", head: true })
      .not("status", "in", '("completed","closed","cancelled","expired","refunded")'),
    supabase.from("disputes").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("providers").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("providers").select("*, profiles!providers_user_id_fkey(full_name)")
      .eq("status", "pending").limit(5),
    supabase.from("provider_tips")
      .select("id, job_id, amount_cents, payment_status, note, created_at, providers(business_name), profiles!provider_tips_customer_id_fkey(full_name)")
      .eq("payment_status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Admin Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-xl text-velocity-300">⚡ VeloCity Admin</Link>
          <div className="flex items-center gap-1 text-xs">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400">Live</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/admin/jobs">Jobs</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/admin/providers">Providers</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/admin/command-center">Command</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/admin/launch-readiness">Launch</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/admin/growth">Growth</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/admin/disputes">Disputes</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white">
            <Link href="/admin/automation/logs">Automation</Link>
          </Button>
          <NotificationBell />
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Command Center</h1>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Total Jobs", value: totalJobs?.toLocaleString() ?? "0", color: "text-white" },
            { label: "Active Jobs", value: activeJobs?.toLocaleString() ?? "0", color: "text-velocity-400" },
            { label: "Open Disputes", value: openDisputes?.toLocaleString() ?? "0", color: openDisputes ? "text-red-400" : "text-white" },
            { label: "Pending Providers", value: pendingProviders?.toLocaleString() ?? "0", color: pendingProviders ? "text-yellow-400" : "text-white" },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-white/5 border-white/10">
              <CardContent className="pt-6">
                <div className={`text-4xl font-bold ${kpi.color}`}>{kpi.value}</div>
                <div className="text-sm text-white/50 mt-1">{kpi.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Jobs */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Jobs</h2>
              <Button variant="ghost" size="sm" asChild className="text-velocity-400">
                <Link href="/admin/jobs">View all →</Link>
              </Button>
            </div>
            <div className="space-y-2">
              {recentJobs?.map((job: Job) => (
                <Link key={job.id} href={`/admin/jobs/${job.id}`}>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <span>{SERVICE_CATEGORY_ICONS[job.category]}</span>
                      <div>
                        <div className="font-medium text-sm">{job.title}</div>
                        <div className="text-xs text-white/40">{formatDateTime(job.created_at)}</div>
                      </div>
                    </div>
                    <Badge className={JOB_STATUS_COLORS[job.status]}>
                      {JOB_STATUS_LABELS[job.status]}
                    </Badge>
                  </div>
                </Link>
              ))}
              {!recentJobs?.length && (
                <div className="text-center py-8 text-white/40">No jobs yet</div>
              )}
            </div>
          </div>

          {/* Pending Providers */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Pending Provider Approvals</h2>
              <Button variant="ghost" size="sm" asChild className="text-velocity-400">
                <Link href="/admin/providers">View all →</Link>
              </Button>
            </div>
            <div className="space-y-2">
              {recentProviders?.map((provider) => {
                const p = provider as Record<string, unknown>;
                const prof = p.profiles as { full_name: string } | null;
                return (
                  <Link key={p.id as string} href={`/admin/providers/${p.id}`}>
                    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
                      <div>
                        <div className="font-medium text-sm">{p.business_name as string}</div>
                        <div className="text-xs text-white/40">
                          {prof?.full_name} • {(p.categories as string[])?.join(", ")}
                        </div>
                      </div>
                      <ProviderApprovalActions providerId={p.id as string} />
                    </div>
                  </Link>
                );
              })}
              {!recentProviders?.length && (
                <div className="text-center py-8 text-white/40">No pending applications</div>
              )}
            </div>
          </div>
        </div>

        {/* Tips Feed */}
        {(recentTips?.length ?? 0) > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Tips 💝</h2>
              <span className="text-sm text-white/40">
                Total: ${(recentTips?.reduce((s, t) => s + (t.amount_cents as number ?? 0), 0) ?? 0 / 100).toFixed(2)}
              </span>
            </div>
            <div className="grid gap-2">
              {recentTips?.map((tip) => {
                const t = tip as Record<string, unknown>;
                return (
                  <div key={tip.id} className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400 font-bold">
                        +${((t.amount_cents as number) / 100).toFixed(2)}
                      </span>
                      <div className="text-sm text-white/60">
                        <span className="text-white/80">
                          {(t.profiles as Record<string, unknown>)?.full_name as string ?? "Customer"}
                        </span>
                        {" → "}
                        <span className="text-white/80">
                          {(t.providers as Record<string, unknown>)?.business_name as string ?? "Provider"}
                        </span>
                      </div>
                      {t.note ? (
                        <span className="text-xs text-white/40 italic truncate max-w-[200px]">
                          &ldquo;{String(t.note)}&rdquo;
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-white/30">
                      {new Date(t.created_at as string).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Agent Status */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">AI Agent Status</h2>
          <div className="grid grid-cols-5 gap-3">
            {[
              { name: "ALICE", role: "Intake", active: true },
              { name: "MAX", role: "Dispatch", active: true },
              { name: "QUINN", role: "Pricing", active: true },
              { name: "NOVA", role: "Workflow", active: true },
              { name: "REX", role: "Quality", active: true },
              { name: "IVY", role: "Disputes", active: openDisputes ? true : false },
              { name: "FINN", role: "Finance", active: true },
              { name: "LENA", role: "Retention", active: true },
              { name: "TESS", role: "Territory", active: true },
              { name: "GABRIEL", role: "Compliance", active: pendingProviders ? true : false },
            ].map((agent) => (
              <Card key={agent.name} className="bg-white/5 border-white/10">
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <div className={`h-2 w-2 rounded-full ${agent.active ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
                    <span className="font-bold text-velocity-300 text-sm">{agent.name}</span>
                  </div>
                  <div className="text-xs text-white/40">{agent.role}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
