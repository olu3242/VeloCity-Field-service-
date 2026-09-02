import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  JOB_STATUS_LABELS,
  SERVICE_CATEGORY_ICONS,
  formatCents,
  formatDateTime,
} from "@/lib/utils";
import type { JobStatus, ServiceCategory } from "@/types";

interface ProviderRow {
  id: string;
  business_name: string;
  trust_score: number | null;
}

interface JobRow {
  id: string;
  title: string;
  category: string;
  status: string;
  final_cost_cents: number | null;
  created_at: string;
}

interface TipRow {
  id: string;
  amount_cents: number;
  created_at: string;
  job_id: string;
}

interface PayoutRow {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  released_at: string | null;
}

function payoutStatusColor(status: string): string {
  switch (status) {
    case "released": return "bg-green-100 text-green-700";
    case "pending": return "bg-yellow-100 text-yellow-700";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default async function ProviderEarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: providerRaw } = await supabase
    .from("providers")
    .select("id, business_name, trust_score")
    .eq("user_id", user.id).single();

  if (!providerRaw) redirect("/provider/apply");
  const provider = providerRaw as unknown as ProviderRow;

  const [{ data: jobsRaw }, { data: tipsRaw }, { data: payoutsRaw }] = await Promise.all([
    supabase.from("jobs")
      .select("id, title, category, status, final_cost_cents, created_at")
      .eq("provider_id", provider.id)
      .in("status", ["customer_confirmed","completed","closed","refunded"])
      .order("created_at", { ascending: false }),
    supabase.from("provider_tips")
      .select("id, amount_cents, created_at, job_id")
      .eq("provider_id", provider.id).eq("payment_status", "succeeded")
      .order("created_at", { ascending: false }),
    supabase.from("payout_queue")
      .select("id, amount_cents, status, created_at, released_at")
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false }).limit(30),
  ]);

  const jobs = (jobsRaw ?? []) as unknown as JobRow[];
  const tips = (tipsRaw ?? []) as unknown as TipRow[];
  const payouts = (payoutsRaw ?? []) as unknown as PayoutRow[];

  const totalEarned = jobs.reduce((sum, j) => sum + Math.round((j.final_cost_cents ?? 0) * 0.82), 0);
  const totalTips = tips.reduce((sum, t) => sum + (t.amount_cents ?? 0), 0);
  const combined = totalEarned + totalTips;
  const pendingPayouts = payouts
    .filter(p => p.status === "pending")
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/provider/dashboard" className="text-sm text-gray-500 hover:text-gray-700 mb-3 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Earnings — {provider.business_name}</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-gray-900">{formatCents(totalEarned)}</div>
              <div className="text-sm text-gray-500 mt-1">Total Earned (82%)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-emerald-600">{formatCents(totalTips)}</div>
              <div className="text-sm text-gray-500 mt-1">Total Tips</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{formatCents(combined)}</div>
              <div className="text-sm text-gray-500 mt-1">Combined Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{formatCents(pendingPayouts)}</div>
              <div className="text-sm text-gray-500 mt-1">Pending Payouts</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Completed Jobs */}
          <Card>
            <CardHeader><CardTitle>Completed Jobs</CardTitle></CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-sm text-gray-500">No completed jobs yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Your Payout (82%)</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map(job => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{SERVICE_CATEGORY_ICONS[job.category as ServiceCategory] ?? "🛠️"}</span>
                            <span className="font-medium text-gray-800">{job.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-gray-700">{formatCents(job.final_cost_cents ?? 0)}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {formatCents(Math.round((job.final_cost_cents ?? 0) * 0.82))}
                        </TableCell>
                        <TableCell className="text-right text-gray-400">{formatDateTime(job.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Tips Received */}
          <Card>
            <CardHeader><CardTitle>Tips Received</CardTitle></CardHeader>
            <CardContent>
              {tips.length === 0 ? (
                <p className="text-sm text-gray-500">No tips received yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tips.map(tip => (
                      <TableRow key={tip.id}>
                        <TableCell className="text-gray-500 font-mono text-xs">{tip.job_id?.slice(0, 12)}...</TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">{formatCents(tip.amount_cents)}</TableCell>
                        <TableCell className="text-right text-gray-400">{formatDateTime(tip.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Payout History */}
          <Card>
            <CardHeader><CardTitle>Payout History</CardTitle></CardHeader>
            <CardContent>
              {payouts.length === 0 ? (
                <p className="text-sm text-gray-500">No payout history yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                      <TableHead className="text-right">Released</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map(payout => (
                      <TableRow key={payout.id}>
                        <TableCell className="font-medium text-gray-800">{formatCents(payout.amount_cents ?? 0)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${payoutStatusColor(payout.status)}`}>
                            {payout.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-gray-400">{formatDateTime(payout.created_at)}</TableCell>
                        <TableCell className="text-right text-gray-400">
                          {payout.released_at ? formatDateTime(payout.released_at) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
