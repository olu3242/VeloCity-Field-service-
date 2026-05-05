import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function ProviderEarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "provider") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const { data: provider } = await supabase.from("providers").select("*").eq("user_id", user.id).eq("tenant_id", tenantId).single();
  if (!provider) redirect("/provider/apply");

  const [{ data: jobs }, { data: payouts }, { data: payments }] = await Promise.all([
    supabase.from("jobs").select("*").eq("provider_id", provider.id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("payout_ledger").select("*").eq("provider_id", provider.id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("payments").select("*").eq("provider_id", provider.id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
  ]);

  const completedJobs = jobs?.filter((job) => ["completed", "closed"].includes(job.status)) ?? [];
  const gross = completedJobs.reduce((sum, job) => sum + (job.final_cost_cents ?? job.quoted_cost_cents ?? 0), 0);
  const pending = payouts?.filter((payout) => ["payout_pending", "queued"].includes(payout.status)).reduce((sum, payout) => sum + Number(payout.amount ?? 0), 0) ?? 0;
  const held = payouts?.filter((payout) => ["payout_hold", "held", "failed"].includes(payout.status)).reduce((sum, payout) => sum + Number(payout.amount ?? 0), 0) ?? 0;
  const released = payouts?.filter((payout) => ["payout_released", "released"].includes(payout.status)).reduce((sum, payout) => sum + Number(payout.amount ?? 0), 0) ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Earnings</h1>
          <p className="text-sm text-gray-500">{provider.business_name}</p>
        </div>
        <Button asChild variant="outline"><Link href="/provider/dashboard">Dashboard</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{formatCents(gross)}</div><div className="text-sm text-gray-500">Gross Completed</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-yellow-700">{formatCents(pending)}</div><div className="text-sm text-gray-500">Pending Payout</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-red-700">{formatCents(held)}</div><div className="text-sm text-gray-500">Held Payout</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-green-700">{formatCents(released)}</div><div className="text-sm text-gray-500">Released</div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Payout History</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(payouts ?? []).map((payout) => (
              <div key={payout.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatCents(payout.amount ?? 0)}</span>
                  <Badge variant={["payout_hold", "held", "failed"].includes(payout.status) ? "destructive" : "secondary"}>{payout.status}</Badge>
                </div>
                <div className="text-xs text-gray-500">{formatDateTime(payout.created_at)}</div>
              </div>
            ))}
            {!payouts?.length && <p className="text-sm text-gray-500">No payout records found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payment Activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(payments ?? []).map((payment) => (
              <div key={payment.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatCents(payment.provider_payout_cents ?? payment.amount_cents ?? 0)}</span>
                  <Badge variant={payment.status === "failed" ? "destructive" : "secondary"}>{payment.status}</Badge>
                </div>
                <div className="text-xs text-gray-500">{payment.type} · {formatDateTime(payment.created_at)}</div>
              </div>
            ))}
            {!payments?.length && <p className="text-sm text-gray-500">No payment records found.</p>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
