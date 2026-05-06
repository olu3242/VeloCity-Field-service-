import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobTransitionButton } from "@/components/jobs/job-transition-button";
import { CheckInButton } from "@/components/jobs/check-in-button";
import { PhotoUploadForm } from "@/components/jobs/photo-upload-form";
import { MessagePanel } from "@/components/jobs/message-panel";
import { getSlaStatus } from "@/lib/sla/slaStatus";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  URGENCY_LABELS,
  formatCents,
  formatDateTime,
  getJobProgressPercent,
  getAvailableTransitions,
} from "@/lib/utils";
import type { Job } from "@/types";

export default async function ProviderJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!provider) redirect("/provider/apply");

  const { data: job } = await supabase
    .from("jobs")
    .select("*, quotes(*), payments(*)")
    .eq("id", id)
    .eq("provider_id", provider.id)
    .single();
  if (!job) notFound();

  // Check if customer left a tip
  const { data: tip } = await supabase
    .from("provider_tips")
    .select("amount_cents, note, created_at")
    .eq("job_id", id)
    .eq("provider_id", provider.id)
    .eq("payment_status", "succeeded")
    .maybeSingle();

  const progress = getJobProgressPercent(job.status as Job["status"]);
  const transitions = getAvailableTransitions(job.status as Job["status"], "provider");
  const [{ data: checkins }, { data: photos }, { data: messages }] = await Promise.all([
    supabase.from("job_checkins").select("*").eq("tenant_id", job.tenant_id).eq("job_id", job.id).order("created_at", { ascending: false }),
    supabase.from("job_photos").select("*").eq("tenant_id", job.tenant_id).eq("job_id", job.id).order("created_at", { ascending: false }),
    supabase.from("job_messages").select("*").eq("tenant_id", job.tenant_id).eq("job_id", job.id).order("created_at", { ascending: true }),
  ]);
  const sla = getSlaStatus(job);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/provider/dashboard" className="text-sm text-gray-500 hover:text-gray-900">
          ← Dashboard
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium truncate">{job.title}</span>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{SERVICE_CATEGORY_ICONS[job.category as Job["category"]]}</span>
              <h1 className="text-2xl font-bold">{job.title}</h1>
            </div>
            <Badge className={JOB_STATUS_COLORS[job.status as Job["status"]]}>
              {JOB_STATUS_LABELS[job.status as Job["status"]]}
            </Badge>
          </div>
          <div className="text-right space-y-1">
            {job.final_cost_cents && (
              <>
                <div className="text-sm text-gray-500">Your earnings</div>
                <div className="text-2xl font-bold text-green-700">
                  {formatCents(Math.round(job.final_cost_cents * 0.82))}
                </div>
              </>
            )}
            {tip && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-sm font-medium border border-rose-100">
                💝 +{formatCents(tip.amount_cents)} tip received
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-velocity-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Available Actions */}
        {transitions.length > 0 && (
          <Card className="mb-6 border-velocity-200 bg-velocity-50">
            <CardHeader>
              <CardTitle className="text-base">Next Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {transitions.map((t) => (
                <JobTransitionButton
                  key={t.to}
                  jobId={job.id}
                  toStatus={t.to}
                  label={t.label}
                  requiresReason={t.requiresReason}
                  variant={
                    t.to === "cancelled" || t.to === "no_show" ? "destructive" :
                    t.to === "completed_pending_confirmation" ? "default" :
                    "outline"
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Arrival Verification</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Badge variant={checkins?.length ? "success" : "warning"}>{checkins?.length ? "verified" : "pending"}</Badge>
              <CheckInButton jobId={job.id} />
              <p className="text-xs text-gray-500">GPS check-in is required before work can begin.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">SLA</CardTitle></CardHeader>
            <CardContent>
              <Badge variant={sla.breached ? "destructive" : sla.warning ? "warning" : "secondary"}>{sla.label}</Badge>
              <p className="mt-2 text-xs text-gray-500">Arrival deadline: {formatDateTime(sla.deadline)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Evidence Upload</CardTitle></CardHeader>
            <CardContent><PhotoUploadForm jobId={job.id} /></CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500">Description</div>
                  <p className="mt-1">{job.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Location</div>
                    <div className="mt-0.5">
                      {job.street}{job.unit ? `, ${job.unit}` : ""}<br />
                      {job.city}, {job.state} {job.zip}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Urgency</div>
                    <div className="mt-0.5">{URGENCY_LABELS[job.urgency as Job["urgency"]]}</div>
                  </div>
                  {job.scheduled_start && (
                    <div>
                      <div className="text-gray-500">Scheduled</div>
                      <div className="mt-0.5">{formatDateTime(job.scheduled_start)}</div>
                    </div>
                  )}
                  {job.checked_in_at && (
                    <div>
                      <div className="text-gray-500">Checked in</div>
                      <div className="mt-0.5">{formatDateTime(job.checked_in_at)}</div>
                    </div>
                  )}
                </div>
                {job.customer_notes && (
                  <div>
                    <div className="text-sm text-gray-500">Customer Notes</div>
                    <p className="mt-1 text-sm">{job.customer_notes}</p>
                  </div>
                )}
                {job.photo_urls?.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-500 mb-2">Customer Photos</div>
                    <div className="flex flex-wrap gap-2">
                      {(job.photo_urls as string[]).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded object-cover border" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* OTP Check-in */}
            {job.status === "arrived" && job.checkin_otp && (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-5">
                  <p className="text-sm font-medium text-orange-800">Ask customer for check-in code:</p>
                  <p className="text-4xl font-bold tracking-widest text-orange-700 mt-2">
                    {job.checkin_otp}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Quotes */}
            {job.quotes?.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Quotes Submitted</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {(job.quotes as Record<string, unknown>[]).map((q) => (
                    <div key={q.id as string} className="text-sm border rounded-lg p-3">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium">{q.is_change_order ? "Change Order" : "Initial Quote"}</span>
                        <span className="font-semibold">{formatCents(q.total_cents as number)}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {q.approved_at ? "✓ Approved" : q.rejected_at ? "✗ Rejected" : "Pending"}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>Job Photos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(photos ?? []).map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block rounded-md border p-3 text-sm hover:border-velocity-300">
                    {photo.photo_type} photo · {formatDateTime(photo.created_at)}
                  </a>
                ))}
                {!photos?.length && <p className="text-sm text-gray-500">No job photos uploaded yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Job Chat</CardTitle></CardHeader>
              <CardContent><MessagePanel jobId={job.id} messages={messages ?? []} /></CardContent>
            </Card>

            {/* Submit Quote button for diagnosis stage */}
            {job.status === "diagnosis_in_progress" && (
              <Card>
                <CardContent className="pt-5">
                  <Link
                    href={`/provider/jobs/${job.id}/quote`}
                    className="inline-flex items-center justify-center rounded-md bg-velocity-600 px-4 py-2 text-sm font-medium text-white hover:bg-velocity-700"
                  >
                    Submit Quote
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5 space-y-3 text-sm">
                {job.estimated_cost_cents && (
                  <div>
                    <div className="text-xs text-gray-500">Estimated</div>
                    <div className="font-semibold">{formatCents(job.estimated_cost_cents)}</div>
                  </div>
                )}
                {job.quoted_cost_cents && (
                  <div>
                    <div className="text-xs text-gray-500">Quoted</div>
                    <div className="font-semibold">{formatCents(job.quoted_cost_cents)}</div>
                  </div>
                )}
                {job.quoted_cost_cents && (
                  <div>
                    <div className="text-xs text-gray-500">Your payout (82%)</div>
                    <div className="font-semibold text-green-700">
                      {formatCents(Math.round(job.quoted_cost_cents * 0.82))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500">Submitted</div>
                  <div>{formatDateTime(job.created_at)}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
