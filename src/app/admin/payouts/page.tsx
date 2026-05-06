import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function AdminPayoutsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);
  const { data: payouts } = await supabase.from("payout_ledger").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payout Queue</h1>
        <Button asChild variant="outline"><Link href="/admin/command-center">Command Center</Link></Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Payouts and Holds</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(payouts ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{formatCents(item.amount ?? 0)}</div>
                <div className="text-xs text-gray-500">{item.provider_id ?? "no provider"} · retries {item.retry_count ?? 0}</div>
              </div>
              <Badge variant={item.status === "payout_hold" || item.status === "payout_failed" ? "destructive" : "secondary"}>{item.status}</Badge>
            </div>
          ))}
          {!payouts?.length && <p className="text-sm text-gray-500">No payout records found.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
