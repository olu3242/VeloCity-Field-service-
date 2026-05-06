import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerJobsList, RelatedList } from "@/components/related-lists";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const [{ data: customer }, { data: metrics }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).eq("tenant_id", tenantId).single(),
    supabase.from("velocity_customer_formula_view").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle(),
  ]);

  if (!customer) redirect("/admin/dashboard");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{customer.full_name ?? customer.id}</h1>
          <p className="text-sm text-gray-500">Customer operations profile</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/dashboard">Back to Admin</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{metrics?.completed_jobs_count ?? 0}</div><div className="text-sm text-gray-500">Completed Jobs</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{formatCents(metrics?.lifetime_value ?? 0)}</div><div className="text-sm text-gray-500">Lifetime Value</div></CardContent></Card>
        <Card><CardContent className="pt-6"><Badge variant={metrics?.churn_risk_label === "high" ? "destructive" : "secondary"}>{metrics?.churn_risk_label ?? "new"}</Badge><div className="mt-2 text-sm text-gray-500">Churn Risk</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm font-medium">{metrics?.last_booking_date ? formatDateTime(metrics.last_booking_date) : "None"}</div><div className="text-sm text-gray-500">Last Booking</div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <CustomerJobsList tenantId={tenantId} customerId={customer.id} />
        <RelatedList title="Customer Payments" table="payments" tenantId={tenantId} filters={[{ column: "customer_id", value: customer.id }]} primaryColumn="type" statusColumn="status" amountColumn="amount_cents" />
        <RelatedList title="Customer Reviews" table="reviews" tenantId={tenantId} filters={[{ column: "reviewer_id", value: customer.id }]} primaryColumn="comment" statusColumn="rating" />
        <RelatedList title="Customer Disputes" table="disputes" tenantId={tenantId} filters={[{ column: "initiated_by", value: customer.id }]} primaryColumn="reason" statusColumn="status" href={(row) => `/admin/disputes/${row.id}`} />
      </section>
    </main>
  );
}
