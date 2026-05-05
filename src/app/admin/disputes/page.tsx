import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function AdminDisputesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const { data: disputes } = await supabase
    .from("disputes")
    .select("*, jobs(title, category, status, final_cost_cents, quoted_cost_cents)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const open = disputes?.filter((item) => !["resolved", "closed"].includes(item.status)).length ?? 0;
  const refundExposure = disputes?.reduce((sum, item) => sum + (item.refund_amount_cents ?? 0), 0) ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disputes</h1>
          <p className="text-sm text-gray-500">Tenant-scoped dispute queue and payout risk view.</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/command-center">Command Center</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{disputes?.length ?? 0}</div><div className="text-sm text-gray-500">Total Disputes</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-red-700">{open}</div><div className="text-sm text-gray-500">Open Reviews</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{formatCents(refundExposure)}</div><div className="text-sm text-gray-500">Refund Exposure</div></CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Dispute Queue</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(disputes ?? []).map((dispute) => {
            const job = dispute.jobs as { title?: string; status?: string; final_cost_cents?: number | null; quoted_cost_cents?: number | null } | null;
            return (
              <div key={dispute.id} className="rounded-md border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-semibold">{dispute.reason}</div>
                    <div className="text-sm text-gray-500">{job?.title ?? "Unknown job"} · {formatDateTime(dispute.created_at)}</div>
                    <p className="mt-2 text-sm text-gray-600">{dispute.description ?? "No description provided."}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={dispute.status === "under_review" ? "warning" : dispute.status === "resolved" ? "success" : "secondary"}>{dispute.status}</Badge>
                    <Badge variant="outline">{formatCents(dispute.refund_amount_cents ?? job?.final_cost_cents ?? job?.quoted_cost_cents ?? 0)}</Badge>
                  </div>
                </div>
              </div>
            );
          })}
          {!disputes?.length && <p className="text-sm text-gray-500">No disputes found.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
