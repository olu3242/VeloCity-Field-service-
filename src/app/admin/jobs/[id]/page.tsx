import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JOB_STATUS_LABELS, formatCents, formatDateTime } from "@/lib/utils";
import type { JobStatus } from "@/types";

export default async function AdminJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const [
    { data: job },
    { data: quotes },
    { data: payments },
    { data: offers },
    { data: events },
    { data: logs },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).eq("tenant_id", tenantId).single(),
    supabase.from("quotes").select("*").eq("job_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("job_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("provider_offers").select("*, providers(business_name, status, trust_score)").eq("job_id", id).eq("tenant_id", tenantId).order("offered_at", { ascending: false }),
    supabase.from("automation_events").select("*").eq("entity_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
    supabase.from("agent_logs").select("*").eq("job_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
  ]);

  if (!job) redirect("/admin/jobs");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="text-sm text-gray-500">{job.city}, {job.state} {job.zip}</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/jobs">Back to Jobs</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><Badge variant="secondary">{JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}</Badge><div className="mt-2 text-sm text-gray-500">Status</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{job.urgency}</div><div className="text-sm text-gray-500">Urgency</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{formatCents(job.quoted_cost_cents ?? job.estimated_cost_cents ?? 0)}</div><div className="text-sm text-gray-500">Quoted/Estimate</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{formatCents(job.final_cost_cents ?? 0)}</div><div className="text-sm text-gray-500">Final</div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-gray-700">{job.description}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div><span className="text-gray-500">Customer:</span> {job.customer_id}</div>
              <div><span className="text-gray-500">Provider:</span> {job.provider_id ?? "Unassigned"}</div>
              <div><span className="text-gray-500">Created:</span> {formatDateTime(job.created_at)}</div>
              <div><span className="text-gray-500">Updated:</span> {formatDateTime(job.updated_at)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Automation</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(events ?? []).slice(0, 5).map((event) => (
              <div key={event.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{event.event_type}</div>
                <div className="text-xs text-gray-500">{formatDateTime(event.created_at)}</div>
              </div>
            ))}
            {!events?.length && <p className="text-sm text-gray-500">No automation events found.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Quotes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(quotes ?? []).map((quote) => (
              <div key={quote.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{formatCents(quote.total_cents ?? 0)}</div>
                <div className="text-xs text-gray-500">{quote.status ?? "submitted"} · {formatDateTime(quote.created_at)}</div>
              </div>
            ))}
            {!quotes?.length && <p className="text-sm text-gray-500">No quotes found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(payments ?? []).map((payment) => (
              <div key={payment.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{formatCents(payment.amount_cents ?? 0)}</div>
                <div className="text-xs text-gray-500">{payment.status} · {payment.type}</div>
              </div>
            ))}
            {!payments?.length && <p className="text-sm text-gray-500">No payments found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Provider Offers</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(offers ?? []).map((offer) => {
              const provider = offer.providers as { business_name?: string } | null;
              return (
                <div key={offer.id} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{provider?.business_name ?? offer.provider_id}</div>
                  <div className="text-xs text-gray-500">Score {Math.round(Number(offer.match_score ?? 0) * 100)}%</div>
                </div>
              );
            })}
            {!offers?.length && <p className="text-sm text-gray-500">No provider offers found.</p>}
          </CardContent>
        </Card>
      </section>

      <Card className="mt-6">
        <CardHeader><CardTitle>Agent Logs</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {(logs ?? []).map((log) => (
            <div key={log.id} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{log.agent_name}</div>
              <div className="text-xs text-gray-500">{log.action} · {formatDateTime(log.created_at)}</div>
            </div>
          ))}
          {!logs?.length && <p className="text-sm text-gray-500">No agent logs found.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
