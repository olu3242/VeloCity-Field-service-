import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { formatCents } from "@/lib/utils";

export default async function AdminMembershipsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");

  const adminClient = await createAdminClient();

  const [plansResult, subscriptionsResult, pricingResult] = await Promise.all([
    adminClient
      .from("membership_plans")
      .select("id, name, slug, description, is_active")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: true }),
    adminClient
      .from("membership_subscriptions")
      .select("id, plan_id, status, billing_frequency, current_period_end, customer_id")
      .eq("tenant_id", profile.tenant_id)
      .order("started_at", { ascending: false }),
    adminClient
      .from("membership_plan_pricing")
      .select("plan_id, billing_frequency, price_cents")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true),
  ]);

  type Plan = { id: string; name: string; slug: string; description: string | null; is_active: boolean };
  type Sub = { id: string; plan_id: string; status: string; billing_frequency: string; current_period_end: string; customer_id: string };
  type Pricing = { plan_id: string; billing_frequency: string; price_cents: number };

  const plans = (plansResult.data ?? []) as Plan[];
  const subscriptions = (subscriptionsResult.data ?? []) as Sub[];
  const pricingRows = (pricingResult.data ?? []) as Pricing[];

  const active = subscriptions.filter((s) => s.status === "active");
  const paused = subscriptions.filter((s) => s.status === "paused");
  const cancelled = subscriptions.filter((s) => s.status === "cancelled");

  const subsByPlan: Record<string, Sub[]> = {};
  for (const sub of subscriptions) {
    if (!subsByPlan[sub.plan_id]) subsByPlan[sub.plan_id] = [];
    subsByPlan[sub.plan_id].push(sub);
  }

  const pricingByPlan: Record<string, Pricing[]> = {};
  for (const p of pricingRows) {
    if (!pricingByPlan[p.plan_id]) pricingByPlan[p.plan_id] = [];
    pricingByPlan[p.plan_id].push(p);
  }

  function statusBadge(s: string) {
    if (s === "active") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (s === "paused") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-white/10 text-white/50 border-white/10";
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Memberships</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/dashboard" className="text-white/40 hover:text-white">Dashboard</Link>
          <Link href="/admin/franchise" className="text-white/40 hover:text-white">Franchise</Link>
          <Link href="/admin/command-center" className="text-white/40 hover:text-white">Command Center</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Membership Plans</h1>
        <p className="text-white/40 text-sm mb-8">Active plans, subscriber counts, and billing status</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Plans", value: plans.length.toString(), color: "text-[#CCFF00]" },
            { label: "Active Subscribers", value: active.length.toString(), color: "text-green-400" },
            { label: "Paused", value: paused.length.toString(), color: "text-yellow-400" },
            { label: "Total Subscriptions", value: subscriptions.length.toString(), color: "text-white" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        {plans.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-gray-900 py-16 text-center text-white/40">
            No membership plans found for this tenant.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-10">
            {plans.map((plan) => {
              const subs = subsByPlan[plan.id] ?? [];
              const activeSubs = subs.filter((s) => s.status === "active");
              const pricing = pricingByPlan[plan.id] ?? [];
              const monthlyPrice = pricing.find((p) => p.billing_frequency === "monthly");
              const annualPrice = pricing.find((p) => p.billing_frequency === "annual");

              return (
                <div key={plan.id} className="rounded-lg border border-white/10 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="font-semibold text-sm">{plan.name}</div>
                      <div className="text-xs text-white/40 font-mono mt-0.5">{plan.slug}</div>
                    </div>
                    <Badge className={plan.is_active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-white/10 text-white/50 border-white/10"}>
                      {plan.is_active ? "active" : "inactive"}
                    </Badge>
                  </div>

                  {plan.description && (
                    <p className="text-xs text-white/50 mb-3">{plan.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    {monthlyPrice && (
                      <div>
                        <div className="text-white/40 mb-0.5">Monthly</div>
                        <div className="font-semibold text-[#CCFF00]">{formatCents(monthlyPrice.price_cents)}/mo</div>
                      </div>
                    )}
                    {annualPrice && (
                      <div>
                        <div className="text-white/40 mb-0.5">Annual</div>
                        <div className="font-semibold text-[#CCFF00]">{formatCents(annualPrice.price_cents)}/yr</div>
                      </div>
                    )}
                    <div>
                      <div className="text-white/40 mb-0.5">Subscribers</div>
                      <div className="font-semibold">{subs.length}</div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-0.5">Active</div>
                      <div className={`font-semibold ${activeSubs.length > 0 ? "text-green-400" : "text-white/40"}`}>
                        {activeSubs.length}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {subscriptions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-4">
              Recent Subscriptions ({subscriptions.slice(0, 50).length} of {subscriptions.length})
            </h2>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Plan</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Billing</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Period End</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {subscriptions.slice(0, 50).map((sub) => {
                    const plan = plans.find((p) => p.id === sub.plan_id);
                    return (
                      <tr key={sub.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium">{plan?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-white/60 capitalize">{sub.billing_frequency}</td>
                        <td className="px-4 py-3">
                          <Badge className={statusBadge(sub.status)}>{sub.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs">
                          {sub.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
