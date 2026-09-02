import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeCustomerMembershipSummary } from "@/lib/membership/customerMembershipSummary";
import { formatCents } from "@/lib/utils";

function billingBadge(freq: string) {
  if (freq === "annual") return "bg-violet-100 text-violet-700";
  if (freq === "quarterly") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function statusBadge(s: string) {
  if (s === "active") return "bg-green-100 text-green-700";
  if (s === "paused") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-500";
}

function tierBar(used: number, total: number | null) {
  if (total === null) return null;
  const pct = Math.min((used / Math.max(total, 1)) * 100, 100);
  return (
    <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
      <div
        className={`h-full rounded-full ${pct >= 90 ? "bg-red-400" : pct >= 60 ? "bg-yellow-400" : "bg-velocity-700"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default async function MembershipPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin" || profile?.role === "super_admin") redirect("/admin/dashboard");
  if (profile?.role === "provider") redirect("/provider/dashboard");

  const memberships = await computeCustomerMembershipSummary(user.id);
  const active = memberships.filter((m) => m.status === "active");
  const totalSavings = memberships.reduce((s, m) => s + m.savingsRealizedCents, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
          <Link href="/dashboard/notifications" className="text-sm text-gray-500 hover:text-gray-900">Notifications</Link>
          <Button asChild>
            <Link href="/book">+ New Request</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Memberships</h1>
            <p className="text-sm text-gray-500 mt-1">
              {active.length} active plan{active.length !== 1 ? "s" : ""}
              {totalSavings > 0 && ` · ${formatCents(totalSavings)} saved this period`}
            </p>
          </div>
        </div>

        {memberships.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-gray-400 text-sm mb-4">You don&apos;t have any membership plans yet.</p>
            <Button asChild variant="outline">
              <Link href="/book">Book a Service</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {memberships.map((m) => (
              <Card key={m.subscriptionId} className={m.status !== "active" ? "opacity-70" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{m.planName}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={statusBadge(m.status)}>{m.status}</Badge>
                        <Badge className={billingBadge(m.billingFrequency)}>{m.billingFrequency}</Badge>
                      </div>
                    </div>
                    {m.savingsRealizedCents > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Savings this period</div>
                        <div className="font-bold text-velocity-700">{formatCents(m.savingsRealizedCents)}</div>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400 text-xs mb-0.5">Period ends</div>
                      <div className="font-medium">
                        {new Date(m.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                    {m.nextServiceDate && (
                      <div>
                        <div className="text-gray-400 text-xs mb-0.5">Next service</div>
                        <div className="font-medium">{m.nextServiceDate}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-gray-400 text-xs mb-0.5">Entitlements</div>
                      <div className="font-medium">{m.entitlements.length}</div>
                    </div>
                  </div>

                  {m.entitlements.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Included Benefits</div>
                      <div className="space-y-3">
                        {m.entitlements.map((e) => (
                          <div key={e.entitlementId}>
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800">{e.serviceTypeName}</span>
                                {e.isPriorityScheduling && (
                                  <Badge className="bg-violet-100 text-violet-700 text-[10px] py-0 px-1.5">Priority</Badge>
                                )}
                              </div>
                              <span className="text-gray-500 text-xs">
                                {e.includedUsesPerPeriod === null
                                  ? `${e.usedThisPeriod} used (unlimited)`
                                  : `${e.usedThisPeriod} / ${e.includedUsesPerPeriod} used`}
                              </span>
                            </div>
                            {tierBar(e.usedThisPeriod, e.includedUsesPerPeriod)}
                            {e.benefitDescription && (
                              <p className="text-xs text-gray-400 mt-1">{e.benefitDescription}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/dashboard" className="text-sm text-velocity-700 hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
