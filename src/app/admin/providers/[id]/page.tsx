import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderDocumentsList, ProviderJobsList, ProviderPayoutsList, RelatedList } from "@/components/related-lists";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function AdminProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const [{ data: provider }, { data: jobs }, { data: reviews }, { data: payouts }] = await Promise.all([
    supabase.from("providers").select("*").eq("id", id).eq("tenant_id", tenantId).single(),
    supabase.from("jobs").select("*").eq("provider_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
    supabase.from("reviews").select("*").eq("reviewee_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
    supabase.from("payout_ledger").select("*").eq("provider_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
  ]);

  if (!provider) redirect("/admin/providers");

  const completed = jobs?.filter((job) => ["completed", "closed"].includes(job.status)) ?? [];
  const revenue = completed.reduce((sum, job) => sum + (job.final_cost_cents ?? job.quoted_cost_cents ?? 0), 0);
  const averageRating = reviews?.length ? reviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / reviews.length : 0;
  const pendingPayout = payouts?.filter((payout) => ["payout_pending", "queued"].includes(payout.status)).reduce((sum, payout) => sum + Number(payout.amount ?? 0), 0) ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{provider.business_name}</h1>
          <p className="text-sm text-gray-500">Provider operations profile</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/providers">Back to Providers</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><Badge variant={provider.status === "approved" ? "success" : "warning"}>{provider.status}</Badge><div className="mt-2 text-sm text-gray-500">Status</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{Math.round(Number(provider.trust_score ?? 0) * 100)}%</div><div className="text-sm text-gray-500">Trust</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{completed.length}</div><div className="text-sm text-gray-500">Completed Jobs</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{averageRating.toFixed(1)}</div><div className="text-sm text-gray-500">Avg Rating</div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <div><span className="text-gray-500">Categories:</span> {(provider.categories ?? []).join(", ")}</div>
            <div><span className="text-gray-500">Radius:</span> {provider.service_radius_miles} miles</div>
            <div><span className="text-gray-500">Hourly rate:</span> {formatCents(provider.hourly_rate_cents ?? 0)}</div>
            <div><span className="text-gray-500">Applied:</span> {formatDateTime(provider.created_at)}</div>
            <div><span className="text-gray-500">Stripe:</span> {provider.stripe_account_status ?? "not connected"}</div>
            <div><span className="text-gray-500">Pending payout:</span> {formatCents(pendingPayout)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{formatCents(revenue)}</div>
            <p className="mt-2 text-sm text-gray-500">Completed-job GMV for this provider in the current tenant.</p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent Jobs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(jobs ?? []).slice(0, 10).map((job) => (
              <Link key={job.id} href={`/admin/jobs/${job.id}`} className="block rounded-md border p-3 text-sm hover:border-velocity-300">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{job.title}</span>
                  <Badge variant="secondary">{job.status}</Badge>
                </div>
                <div className="text-xs text-gray-500">{formatDateTime(job.created_at)}</div>
              </Link>
            ))}
            {!jobs?.length && <p className="text-sm text-gray-500">No provider jobs found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payout History</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(payouts ?? []).slice(0, 10).map((payout) => (
              <div key={payout.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatCents(payout.amount ?? 0)}</span>
                  <Badge variant={payout.status === "payout_hold" ? "destructive" : "secondary"}>{payout.status}</Badge>
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
