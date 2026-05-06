import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export default async function AdminAutomationLogsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const [{ data: queue }, { data: events }, { data: logs }] = await Promise.all([
    supabase.from("automation_queue").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("automation_events").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("agent_logs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
  ]);

  const failed = queue?.filter((item) => item.status === "failed" || item.error_message).length ?? 0;
  const pending = queue?.filter((item) => item.status === "pending").length ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automation Logs</h1>
          <p className="text-sm text-gray-500">Queue, event, and agent log visibility for the active tenant.</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/command-center">Command Center</Link></Button>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{events?.length ?? 0}</div><div className="text-sm text-gray-500">Recent Events</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{queue?.length ?? 0}</div><div className="text-sm text-gray-500">Queue Items</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-yellow-700">{pending}</div><div className="text-sm text-gray-500">Pending</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-red-700">{failed}</div><div className="text-sm text-gray-500">Failed</div></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Queue</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(queue ?? []).slice(0, 20).map((item) => (
              <div key={item.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.event_type}</span>
                  <Badge variant={item.status === "failed" ? "destructive" : item.status === "completed" ? "success" : "secondary"}>{item.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-gray-500">Retries {item.retry_count ?? 0} · {formatDateTime(item.created_at)}</div>
                {item.error_message && <p className="mt-1 text-xs text-red-600">{item.error_message}</p>}
              </div>
            ))}
            {!queue?.length && <p className="text-sm text-gray-500">No queue items found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(events ?? []).slice(0, 20).map((event) => (
              <div key={event.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{event.event_type}</div>
                <div className="text-xs text-gray-500">{event.source} · {formatDateTime(event.created_at)}</div>
              </div>
            ))}
            {!events?.length && <p className="text-sm text-gray-500">No automation events found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Agent Logs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(logs ?? []).slice(0, 20).map((log) => (
              <div key={log.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{log.agent_name}</span>
                  <Badge variant={log.error ? "destructive" : "secondary"}>{log.error ? "error" : "logged"}</Badge>
                </div>
                <div className="text-xs text-gray-500">{log.action} · {formatDateTime(log.created_at)}</div>
              </div>
            ))}
            {!logs?.length && <p className="text-sm text-gray-500">No agent logs found.</p>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
