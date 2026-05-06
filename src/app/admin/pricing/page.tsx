import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function AdminPricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);
  const { data: decisions } = await supabase
    .from("pricing_decisions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const flagged = (decisions ?? []).filter((item) => item.status === "flagged" || item.status === "rejected");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pricing Operations</h1>
          <p className="text-sm text-gray-500">Quote validation, pricing decisions, and overpricing alerts.</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/command-center">Command Center</Link></Button>
      </div>
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{decisions?.length ?? 0}</div><div className="text-sm text-gray-500">Pricing decisions</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{flagged.length}</div><div className="text-sm text-gray-500">Quote flags</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{decisions?.filter((item) => item.status === "approved").length ?? 0}</div><div className="text-sm text-gray-500">Approved range</div></CardContent></Card>
      </section>
      <Card>
        <CardHeader><CardTitle>Recent Pricing Decisions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(decisions ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{formatCents(item.amount ?? 0)}</div>
                <div className="text-xs text-gray-500">{item.pricing_mode} · {item.job_id ?? "no job"}</div>
              </div>
              <Badge variant={item.status === "approved" ? "success" : item.status === "flagged" ? "warning" : "destructive"}>{item.status}</Badge>
            </div>
          ))}
          {!decisions?.length && <p className="text-sm text-gray-500">No pricing decisions found.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
