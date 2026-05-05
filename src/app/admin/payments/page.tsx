import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);
  const [{ data: ledger }, { data: refunds }] = await Promise.all([
    supabase.from("payment_ledger").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("refund_records").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
  ]);
  const failed = (ledger ?? []).filter((item) => item.status === "payment_failed");
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payments</h1>
        <Button asChild variant="outline"><Link href="/admin/command-center">Command Center</Link></Button>
      </div>
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{ledger?.length ?? 0}</div><div className="text-sm text-gray-500">Ledger entries</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{failed.length}</div><div className="text-sm text-gray-500">Failed payments</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{refunds?.length ?? 0}</div><div className="text-sm text-gray-500">Refunds</div></CardContent></Card>
      </section>
      <Card>
        <CardHeader><CardTitle>Payment Ledger</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(ledger ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
              <span>{formatCents(item.amount ?? 0)}</span>
              <Badge variant={item.status === "payment_failed" ? "destructive" : "secondary"}>{item.status}</Badge>
            </div>
          ))}
          {!ledger?.length && <p className="text-sm text-gray-500">No payment ledger entries found.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
