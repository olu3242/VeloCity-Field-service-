import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisputeActions } from "@/components/admin/dispute-actions";
import { formatCents, formatDateTime, SERVICE_CATEGORY_ICONS } from "@/lib/utils";
import type { ServiceCategory } from "@/types";

interface JobData {
  id: string;
  title: string;
  category: string;
  status: string;
  description: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  customer_id: string;
  provider_id: string;
  final_cost_cents: number | null;
  quoted_cost_cents: number | null;
  created_at: string;
  customer_confirmed_at: string | null;
}

interface DisputeData {
  id: string;
  status: string;
  reason: string;
  desired_resolution: string | null;
  resolution: string | null;
  created_at: string;
  job_id: string;
  jobs: JobData;
}

interface ProviderProfileData {
  full_name: string;
  email: string;
}

interface ProviderData {
  business_name: string;
  trust_score: number | null;
  profiles: ProviderProfileData | null;
}

interface CustomerProfile {
  full_name: string;
  email: string;
}

function getDaysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "open": return "bg-red-800 text-red-200";
    case "under_review": return "bg-yellow-800 text-yellow-200";
    case "resolved": return "bg-green-800 text-green-200";
    case "closed": return "bg-gray-700 text-gray-300";
    default: return "bg-gray-700 text-gray-300";
  }
}

export default async function AdminDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: disputeRaw } = await supabase
    .from("disputes")
    .select("*, jobs!disputes_job_id_fkey(id, title, category, status, description, street, city, state, zip, customer_id, provider_id, final_cost_cents, quoted_cost_cents, created_at, customer_confirmed_at)")
    .eq("id", id).single();

  if (!disputeRaw) notFound();

  const dispute = disputeRaw as unknown as DisputeData;
  const job = dispute.jobs;

  const [{ data: providerRaw }, { data: customerRaw }] = await Promise.all([
    supabase.from("providers")
      .select("business_name, trust_score, profiles!providers_user_id_fkey(full_name, email)")
      .eq("id", job.provider_id).single(),
    supabase.from("profiles").select("full_name, email").eq("id", job.customer_id).single(),
  ]);

  const provider = providerRaw as unknown as ProviderData | null;
  const customer = customerRaw as unknown as CustomerProfile | null;

  const daysOpen = getDaysOpen(dispute.created_at);
  const finalAmount = job.final_cost_cents ?? job.quoted_cost_cents ?? 0;
  const platformFee = Math.round(finalAmount * 0.18);
  const providerPayout = finalAmount - platformFee;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/disputes" className="text-sm text-white/50 hover:text-white/80 mb-3 inline-block">
            ← Back to Disputes
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Dispute #{id.slice(0, 8)}</h1>
            <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadgeColor(dispute.status)}`}>
              {dispute.status.replace("_", " ")}
            </span>
            <span className="text-sm text-white/40">
              {daysOpen === 0 ? "Opened today" : `Open ${daysOpen} days`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Dispute Details */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Dispute Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-white/70">
                <div>
                  <span className="text-white/40 text-xs uppercase tracking-wide">Reason</span>
                  <p className="mt-1 text-white">{dispute.reason}</p>
                </div>
                {dispute.desired_resolution && (
                  <div>
                    <span className="text-white/40 text-xs uppercase tracking-wide">Desired Resolution</span>
                    <p className="mt-1">{dispute.desired_resolution}</p>
                  </div>
                )}
                {dispute.resolution && (
                  <div>
                    <span className="text-white/40 text-xs uppercase tracking-wide">Resolution</span>
                    <p className="mt-1 text-green-400">{dispute.resolution}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Job Summary */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Job Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <span>{SERVICE_CATEGORY_ICONS[job.category as ServiceCategory] ?? "🛠️"}</span>
                  <span className="text-white font-medium">{job.title}</span>
                </div>
                {(job.street || job.city) && (
                  <div>
                    <span className="text-white/40">Address:</span>{" "}
                    {[job.street, job.city, job.state, job.zip].filter(Boolean).join(", ")}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-white/40">Final Amount:</span> {formatCents(finalAmount)}</div>
                  <div><span className="text-white/40">Job Status:</span> {job.status}</div>
                  <div><span className="text-white/40">Created:</span> {formatDateTime(job.created_at)}</div>
                  {job.customer_confirmed_at && (
                    <div><span className="text-white/40">Confirmed:</span> {formatDateTime(job.customer_confirmed_at)}</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Customer */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Customer</CardTitle></CardHeader>
              <CardContent className="text-sm text-white/70">
                {customer ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-white/40">Name:</span> {customer.full_name}</div>
                    <div><span className="text-white/40">Email:</span> {customer.email}</div>
                  </div>
                ) : (
                  <p className="text-white/40">Customer data unavailable</p>
                )}
              </CardContent>
            </Card>

            {/* Provider */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Provider</CardTitle></CardHeader>
              <CardContent className="text-sm text-white/70">
                {provider ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div><span className="text-white/40">Business:</span> {provider.business_name}</div>
                      <div><span className="text-white/40">Trust Score:</span> {((Number(provider.trust_score ?? 0)) * 100).toFixed(0)}%</div>
                      {provider.profiles && (
                        <>
                          <div><span className="text-white/40">Contact:</span> {provider.profiles.full_name}</div>
                          <div><span className="text-white/40">Email:</span> {provider.profiles.email}</div>
                        </>
                      )}
                    </div>
                    <Link
                      href={`/admin/providers/${job.provider_id}`}
                      className="inline-block mt-2 text-xs text-velocity-400 hover:text-velocity-300"
                    >
                      View Provider Profile →
                    </Link>
                  </div>
                ) : (
                  <p className="text-white/40">Provider data unavailable</p>
                )}
              </CardContent>
            </Card>

            {/* IVY Agent */}
            <Card className="bg-white/5 border-white/10 border-dashed">
              <CardHeader><CardTitle className="text-white/50">IVY Agent Analysis</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-white/30 italic">
                  IVY analysis pending — trigger via /api/automation/process
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Resolution Actions */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Resolution Actions</CardTitle></CardHeader>
              <CardContent>
                <DisputeActions disputeId={dispute.id} jobId={job.id} />
              </CardContent>
            </Card>

            {/* Amounts */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader><CardTitle className="text-white">Amounts</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/50">Final Cost</span>
                  <span className="text-white font-medium">{formatCents(finalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Platform Fee (18%)</span>
                  <span className="text-white">{formatCents(platformFee)}</span>
                </div>
                <div className="border-t border-white/10 pt-2 flex justify-between">
                  <span className="text-white/80 font-medium">Provider Payout (82%)</span>
                  <span className="text-green-400 font-bold">{formatCents(providerPayout)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
