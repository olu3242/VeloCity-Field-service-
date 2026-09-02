import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatCents, formatDateTime } from "@/lib/utils";
import { computeCommercialAccountSummary } from "@/lib/commercial/commercialAccountSummary";

function statusBadge(s: string) {
  if (s === "active") return "bg-green-100 text-green-700";
  if (s === "at_risk") return "bg-yellow-100 text-yellow-700";
  if (s === "churned") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-500";
}

function contractBadge(s: string) {
  if (s === "active") return "bg-green-100 text-green-700";
  if (s === "at_risk") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-500";
}

export default async function CustomerCommercialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin" || profile?.role === "super_admin") redirect("/admin/commercial");
  if (profile?.role === "provider") redirect("/provider/dashboard");

  const { data: accountRow } = await supabase
    .from("commercial_accounts")
    .select("id")
    .eq("primary_contact_id", user.id)
    .maybeSingle();

  if (!accountRow) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
            <Button asChild>
              <Link href="/book">+ New Request</Link>
            </Button>
          </div>
        </nav>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Commercial Account</h1>
          <p className="text-gray-500 text-sm">
            You are not associated with a commercial account. Contact your VeloCity account manager
            to set up commercial service.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const account = await computeCommercialAccountSummary(accountRow.id);
  if (!account) redirect("/dashboard");

  const totalContractValue = account.activeContracts.reduce((s, c) => s + c.contractValueCents, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
          <Link href="/dashboard/disputes" className="text-sm text-gray-500 hover:text-gray-900">Disputes</Link>
          <Link href="/dashboard/notifications" className="text-sm text-gray-500 hover:text-gray-900">Notifications</Link>
          <Button asChild>
            <Link href="/book">+ New Request</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={statusBadge(account.status)}>{account.status}</Badge>
              <span className="text-sm text-gray-500">Commercial Account</span>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active Contracts" value={account.activeContracts.length.toString()} />
          <StatCard label="Locations" value={account.locationCount.toString()} />
          <StatCard label="Total Jobs" value={account.jobCount.toString()} />
          <StatCard label="Realized Revenue" value={formatCents(account.realizedRevenueCents)} />
        </div>

        {/* Contracts */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
            Active Contracts ({account.activeContracts.length})
          </h2>

          {account.activeContracts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white py-10 text-center text-gray-400 text-sm">
              No active contracts.
            </div>
          ) : (
            <div className="space-y-4">
              {account.activeContracts.map((contract) => (
                <Card key={contract.contractId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base capitalize">
                          {contract.contractType.replace(/_/g, " ")} Contract
                        </CardTitle>
                        <div className="text-xs text-gray-500 mt-1">
                          {contract.billingFrequency} billing · {formatCents(contract.contractValueCents)}/period
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={contractBadge(contract.status)}>{contract.status}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-400 text-xs mb-0.5">Start</div>
                        <div>{contract.startDate ? formatDateTime(contract.startDate) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs mb-0.5">End</div>
                        <div>{contract.endDate ? formatDateTime(contract.endDate) : "Ongoing"}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs mb-0.5">Contract Value</div>
                        <div className="font-semibold">{formatCents(contract.contractValueCents)}</div>
                      </div>
                    </div>

                    {contract.servicePlans.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Included Services
                        </div>
                        <div className="space-y-1">
                          {contract.servicePlans.map((plan, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs text-gray-600">
                              <span>{plan.serviceTypeName}</span>
                              <span className="text-gray-400">
                                {plan.includedUsesPerPeriod !== null
                                  ? `${plan.includedUsesPerPeriod}×/${plan.period}`
                                  : `unlimited/${plan.period}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {totalContractValue > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            <span className="text-gray-400">Total contracted value: </span>
            <span className="font-semibold text-gray-900">{formatCents(totalContractValue)}</span>
            <span className="text-gray-400"> · </span>
            <span className="text-gray-400">Realized revenue to date: </span>
            <span className="font-semibold text-gray-900">{formatCents(account.realizedRevenueCents)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
