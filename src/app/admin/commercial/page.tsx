import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { formatCents } from "@/lib/utils";

function statusBadge(s: string) {
  if (s === "active") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (s === "at_risk") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (s === "churned") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-white/10 text-white/50 border-white/10";
}

function contractBadge(s: string) {
  if (s === "active") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (s === "at_risk") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (s === "expired") return "bg-white/10 text-white/40 border-white/10";
  return "bg-white/10 text-white/50 border-white/10";
}

export default async function AdminCommercialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");

  const adminClient = await createAdminClient();

  const [accountsResult, contractsResult, revenueResult] = await Promise.all([
    adminClient
      .from("commercial_accounts")
      .select("id, name, status, created_at, primary_contact_id")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    adminClient
      .from("commercial_contracts")
      .select("id, account_id, contract_type, status, contract_value_cents, billing_frequency, start_date, end_date")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    adminClient
      .from("revenue_records")
      .select("commercial_account_id, gross_amount_cents")
      .eq("tenant_id", profile.tenant_id)
      .not("commercial_account_id", "is", null),
  ]);

  type Account = { id: string; name: string; status: string; created_at: string; primary_contact_id: string | null };
  type Contract = { id: string; account_id: string; contract_type: string; status: string; contract_value_cents: number; billing_frequency: string; start_date: string; end_date: string | null };

  const accounts = (accountsResult.data ?? []) as Account[];
  const contracts = (contractsResult.data ?? []) as Contract[];
  const revenueRows = revenueResult.data ?? [];

  const contractsByAccount: Record<string, Contract[]> = {};
  for (const c of contracts) {
    if (!contractsByAccount[c.account_id]) contractsByAccount[c.account_id] = [];
    contractsByAccount[c.account_id].push(c);
  }

  const revenueByAccount: Record<string, number> = {};
  for (const r of revenueRows) {
    const aid = r.commercial_account_id as string;
    if (aid) revenueByAccount[aid] = (revenueByAccount[aid] ?? 0) + (r.gross_amount_cents ?? 0);
  }

  const active = accounts.filter((a) => a.status === "active");
  const atRisk = accounts.filter((a) => a.status === "at_risk");
  const activeContracts = contracts.filter((c) => c.status === "active");
  const totalRevenue = Object.values(revenueByAccount).reduce((s, v) => s + v, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Commercial Accounts</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/dashboard" className="text-white/40 hover:text-white">Dashboard</Link>
          <Link href="/admin/memberships" className="text-white/40 hover:text-white">Memberships</Link>
          <Link href="/admin/command-center" className="text-white/40 hover:text-white">Command Center</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Commercial Accounts</h1>
        <p className="text-white/40 text-sm mb-8">
          All commercial accounts, contracts, and realized revenue for this tenant
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Accounts", value: accounts.length.toString(), color: "text-[#CCFF00]" },
            { label: "Active", value: active.length.toString(), color: "text-green-400" },
            { label: "At Risk", value: atRisk.length.toString(), color: atRisk.length > 0 ? "text-yellow-400" : "text-white/40" },
            { label: "Realized Revenue", value: formatCents(totalRevenue), color: totalRevenue > 0 ? "text-[#CCFF00]" : "text-white/40" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-gray-900 py-16 text-center text-white/40">
            No commercial accounts found for this tenant.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-white/60 font-medium">Account</th>
                  <th className="px-4 py-3 text-left text-white/60 font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-white/60 font-medium">Contracts</th>
                  <th className="px-4 py-3 text-left text-white/60 font-medium">Active</th>
                  <th className="px-4 py-3 text-left text-white/60 font-medium">Contract Value</th>
                  <th className="px-4 py-3 text-left text-white/60 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {accounts.map((acct) => {
                  const acctContracts = contractsByAccount[acct.id] ?? [];
                  const acctActive = acctContracts.filter((c) => c.status === "active");
                  const totalValue = acctContracts.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0);
                  const revenue = revenueByAccount[acct.id] ?? 0;
                  return (
                    <tr key={acct.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-medium">{acct.name}</td>
                      <td className="px-4 py-3">
                        <Badge className={statusBadge(acct.status)}>{acct.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-white/60">{acctContracts.length}</td>
                      <td className="px-4 py-3">
                        <span className={acctActive.length > 0 ? "text-green-400" : "text-white/30"}>
                          {acctActive.length}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {totalValue > 0 ? formatCents(totalValue) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={revenue > 0 ? "text-[#CCFF00]" : "text-white/30"}>
                          {revenue > 0 ? formatCents(revenue) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Contract detail table */}
        {activeContracts.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-4">
              Active Contracts ({activeContracts.length})
            </h2>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Account</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Value</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">Billing</th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">End Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {activeContracts.slice(0, 50).map((c) => {
                    const acct = accounts.find((a) => a.id === c.account_id);
                    return (
                      <tr key={c.id} className="bg-gray-900/50 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium">{acct?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-white/60 capitalize">{c.contract_type.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">
                          <Badge className={contractBadge(c.status)}>{c.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-[#CCFF00] font-medium">
                          {formatCents(c.contract_value_cents)}
                        </td>
                        <td className="px-4 py-3 text-white/60 capitalize">{c.billing_frequency}</td>
                        <td className="px-4 py-3 text-white/40 text-xs">
                          {c.end_date
                            ? new Date(c.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "Ongoing"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
