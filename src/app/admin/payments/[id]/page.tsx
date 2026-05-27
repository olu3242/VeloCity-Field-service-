import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentLedgerList, RelatedList } from "@/components/related-lists";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function AdminPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const [{ data: payment }, { data: metrics }] = await Promise.all([
    supabase.from("payments").select("*, jobs(title, status), profiles!payments_customer_id_fkey(full_name), providers(business_name)").eq("id", id).eq("tenant_id", tenantId).single(),
    supabase.from("velocity_payment_formula_view").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (!payment) redirect("/admin/payments");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{formatCents(payment.amount_cents ?? 0)}</h1>
          <p className="text-sm text-gray-500">{payment.type} · {formatDateTime(payment.created_at)}</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/payments">Back to Payments</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><Badge variant={payment.status === "failed" ? "destructive" : "secondary"}>{payment.status}</Badge><div className="mt-2 text-sm text-gray-500">Status</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{formatCents(metrics?.net_platform_revenue ?? payment.platform_fee_cents ?? 0)}</div><div className="text-sm text-gray-500">Net Platform Revenue</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{formatCents(metrics?.provider_payout_amount ?? payment.provider_payout_cents ?? 0)}</div><div className="text-sm text-gray-500">Provider Payout</div></CardContent></Card>
        <Card><CardContent className="pt-6"><Badge variant={metrics?.is_payout_blocked ? "destructive" : "success"}>{metrics?.is_payout_blocked ? "blocked" : "clear"}</Badge><div className="mt-2 text-sm text-gray-500">Payout Risk</div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PaymentLedgerList tenantId={tenantId} paymentId={payment.id} />
        <RelatedList title="Payout History" table="payout_ledger" tenantId={tenantId} filters={[{ column: "payment_id", value: payment.id }]} primaryColumn="status" statusColumn="status" amountColumn="amount" />
        <RelatedList title="Refund History" table="refund_records" tenantId={tenantId} filters={[{ column: "payment_id", value: payment.id }]} primaryColumn="reason" statusColumn="status" amountColumn="amount" />
        <RelatedList title="Related Job Payments" table="payments" tenantId={tenantId} filters={[{ column: "job_id", value: payment.job_id }]} primaryColumn="type" statusColumn="status" amountColumn="amount_cents" />
      </section>
    </main>
  );
}
