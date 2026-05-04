import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  SERVICE_CATEGORY_LABELS,
  URGENCY_LABELS,
  formatCents,
  formatDateTime,
  getJobProgressPercent,
} from "@/lib/utils";
import type { Job, Quote } from "@/types";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: job } = await supabase
    .from("jobs")
    .select(`
      *,
      quotes(*),
      payments(*)
    `)
    .eq("id", id)
    .eq("customer_id", user.id)
    .single();

  if (!job) notFound();

  const progress = getJobProgressPercent(job.status as Job["status"]);
  const latestQuote = job.quotes?.[job.quotes.length - 1];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium">{job.title}</span>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{SERVICE_CATEGORY_ICONS[job.category as Job["category"]]}</span>
              <h1 className="text-2xl font-bold">{job.title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={JOB_STATUS_COLORS[job.status as Job["status"]]}>
                {JOB_STATUS_LABELS[job.status as Job["status"]]}
              </Badge>
              <span className="text-sm text-gray-500">
                {SERVICE_CATEGORY_LABELS[job.category as Job["category"]]} • {URGENCY_LABELS[job.urgency as Job["urgency"]]}
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>Job Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-velocity-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Main details */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Job Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500">Description</div>
                  <p className="mt-1">{job.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Location</div>
                    <div className="mt-1">
                      {job.street}{job.unit ? `, ${job.unit}` : ""}<br />
                      {job.city}, {job.state} {job.zip}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Submitted</div>
                    <div className="mt-1">{formatDateTime(job.created_at)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quote */}
            {latestQuote && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {(latestQuote as Quote).is_change_order ? "Change Order" : "Quote"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {((latestQuote as Quote).line_items as Quote["line_items"]).map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.description}</span>
                        <span>{formatCents(item.total_cents)}</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Subtotal</span>
                        <span>{formatCents((latestQuote as Quote).subtotal_cents)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Tax</span>
                        <span>{formatCents((latestQuote as Quote).tax_cents)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span>{formatCents((latestQuote as Quote).total_cents)}</span>
                      </div>
                    </div>
                  </div>

                  {job.status === "awaiting_quote_approval" && (
                    <div className="flex gap-3 mt-6">
                      <Button
                        className="flex-1"
                        onClick={async () => {
                          "use server";
                        }}
                      >
                        Approve Quote
                      </Button>
                      <Button variant="outline" className="flex-1">
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Payments */}
            {job.payments?.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {job.payments.map((p: Record<string, unknown>) => (
                      <div key={p.id as string} className="flex justify-between text-sm">
                        <div>
                          <span className="font-medium capitalize">{p.type as string}</span>
                          <span className="text-gray-400 ml-2">{formatDateTime(p.created_at as string)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{formatCents(p.amount_cents as number)}</span>
                          <Badge variant={p.status === "captured" || p.status === "escrowed" ? "success" : "secondary"}>
                            {p.status as string}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-3">
                {job.estimated_cost_cents && (
                  <div>
                    <div className="text-xs text-gray-500">Estimated</div>
                    <div className="font-semibold">{formatCents(job.estimated_cost_cents)}</div>
                  </div>
                )}
                {job.quoted_cost_cents && (
                  <div>
                    <div className="text-xs text-gray-500">Quoted</div>
                    <div className="font-semibold text-lg">{formatCents(job.quoted_cost_cents)}</div>
                  </div>
                )}
                {job.final_cost_cents && (
                  <div>
                    <div className="text-xs text-gray-500">Final</div>
                    <div className="font-semibold text-lg text-green-700">{formatCents(job.final_cost_cents)}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {["completed", "customer_confirmed"].includes(job.status) && !job.payments?.find((p: Record<string, unknown>) => p.type === "final") && (
              <Button className="w-full" asChild>
                <Link href={`/dashboard/jobs/${job.id}/pay`}>Pay Final Amount</Link>
              </Button>
            )}

            {job.status === "completed" && (
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/dashboard/jobs/${job.id}/dispute`}>Open Dispute</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
