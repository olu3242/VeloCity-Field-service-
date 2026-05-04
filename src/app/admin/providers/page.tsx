import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ProviderApprovalActions } from "@/components/admin/provider-actions";
import { formatDateTime } from "@/lib/utils";

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  let query = supabase
    .from("providers")
    .select("*, profiles!providers_user_id_fkey(full_name, email:id, phone)")
    .order("created_at", { ascending: false });

  if (sp.status) query = query.eq("status", sp.status);
  else query = query.in("status", ["pending", "under_review"]);

  const { data: providers } = await query.limit(50);

  const STATUS_BADGE: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    under_review: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    suspended: "bg-red-100 text-red-800",
    rejected: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center gap-6">
        <Link href="/admin/dashboard" className="font-bold text-velocity-300">⚡ Admin</Link>
        <span className="text-white/30">/</span>
        <span className="text-white/70">Providers</span>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Providers</h1>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {[
            { label: "Pending", value: "pending" },
            { label: "Under Review", value: "under_review" },
            { label: "Approved", value: "approved" },
            { label: "Suspended", value: "suspended" },
          ].map((f) => (
            <Link key={f.value} href={`/admin/providers?status=${f.value}`}>
              <span className={`px-3 py-1 rounded-full text-xs border cursor-pointer transition-colors ${sp.status === f.value ? "bg-velocity-600 border-velocity-600" : "border-white/20 text-white/50 hover:border-white/50"}`}>
                {f.label}
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Categories</th>
                <th className="px-4 py-3 text-left">Trust</th>
                <th className="px-4 py-3 text-left">Jobs</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Applied</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {providers?.map((p) => {
                const prov = p as Record<string, unknown>;
                const prof = prov.profiles as { full_name: string } | null;
                const status = prov.status as string;
                return (
                  <tr key={prov.id as string} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{prov.business_name as string}</div>
                      <div className="text-xs text-white/40">{prof?.full_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/60 max-w-[140px] truncate">
                      {(prov.categories as string[])?.join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      {((prov.trust_score as number) * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {prov.completed_jobs as number}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"}>
                        {status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {formatDateTime(prov.created_at as string)}
                    </td>
                    <td className="px-4 py-3">
                      {(status === "pending" || status === "under_review") && (
                        <ProviderApprovalActions providerId={prov.id as string} />
                      )}
                      {status === "approved" && (
                        <Link href={`/admin/providers/${prov.id}`}>
                          <span className="text-velocity-400 hover:underline text-xs">View →</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!providers?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/30">
                    No providers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
