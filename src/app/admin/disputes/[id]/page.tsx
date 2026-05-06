import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisputeEvidenceList, JobEventsList, JobMessagesList, JobPaymentsList } from "@/components/related-lists";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function AdminDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const [{ data: dispute }, { data: metrics }] = await Promise.all([
    supabase.from("disputes").select("*, jobs(title, status, final_cost_cents, quoted_cost_cents)").eq("id", id).eq("tenant_id", tenantId).single(),
    supabase.from("velocity_dispute_formula_view").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (!dispute) redirect("/admin/disputes");

  const job = dispute.jobs as { title?: string; status?: string; final_cost_cents?: number | null; quoted_cost_cents?: number | null } | null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{dispute.reason}</h1>
          <p className="text-sm text-gray-500">{job?.title ?? "Unknown job"} · {formatDateTime(dispute.created_at)}</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/disputes">Back to Disputes</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><Badge variant={dispute.status === "open" ? "destructive" : "secondary"}>{dispute.status}</Badge><div className="mt-2 text-sm text-gray-500">Status</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{Math.round(Number(metrics?.dispute_age_hours ?? 0))}</div><div className="text-sm text-gray-500">Age Hours</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{metrics?.evidence_count ?? 0}</div><div className="text-sm text-gray-500">Evidence Items</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{formatCents(dispute.refund_amount_cents ?? job?.final_cost_cents ?? job?.quoted_cost_cents ?? 0)}</div><div className="text-sm text-gray-500">Exposure</div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>IVY Recommendation</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Badge variant="secondary">{metrics?.ivy_recommendation_status ?? "not_run"}</Badge>
            <p className="text-gray-600">{dispute.ai_recommendation?.reasoning ?? dispute.resolution_notes ?? "No recommendation details yet."}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Admin Decision</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-gray-500">Resolution requires a tenant admin decision. Live mutation is intentionally kept behind future permission-gated actions.</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled>Resolve Customer</Button>
              <Button variant="outline" disabled>Resolve Provider</Button>
            </div>
          </CardContent>
        </Card>
        <DisputeEvidenceList tenantId={tenantId} disputeId={dispute.id} />
        <JobEventsList tenantId={tenantId} jobId={dispute.job_id} />
        <JobPaymentsList tenantId={tenantId} jobId={dispute.job_id} />
        <JobMessagesList tenantId={tenantId} jobId={dispute.job_id} />
      </section>
    </main>
  );
}
