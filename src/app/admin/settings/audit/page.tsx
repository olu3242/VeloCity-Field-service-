import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export default async function AdminSettingsAuditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "audit_logs", action: "read", route: "/admin/settings/audit" });
  if (!access.allowed) redirect("/dashboard");

  const [{ data: accessLogs }, { data: settingsLogs }] = await Promise.all([
    supabase.from("access_audit_logs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("settings_audit_logs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Access Audit</h1>
        <Button asChild variant="outline"><Link href="/admin/settings">Settings</Link></Button>
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Denied Access Attempts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(accessLogs ?? []).map((log) => (
              <div key={log.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium">{log.object_key ?? log.route}</span><Badge variant="destructive">{log.decision}</Badge></div>
                <div className="text-xs text-gray-500">{log.persona_key ?? "unknown persona"} · {log.action_key ?? "route"} · {formatDateTime(log.created_at)}</div>
                <p className="mt-1 text-xs text-gray-600">{log.reason}</p>
              </div>
            ))}
            {!accessLogs?.length && <p className="text-sm text-gray-500">No denied access attempts found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Settings Changes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(settingsLogs ?? []).map((log) => (
              <div key={log.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium">{log.setting_type}: {log.setting_key}</span><Badge variant="secondary">{log.action}</Badge></div>
                <div className="text-xs text-gray-500">{formatDateTime(log.created_at)}</div>
              </div>
            ))}
            {!settingsLogs?.length && <p className="text-sm text-gray-500">No settings changes found.</p>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
