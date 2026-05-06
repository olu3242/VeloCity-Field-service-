import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminSettingsUsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "users", action: "manage_settings", route: "/admin/settings/users" });
  if (!access.allowed) redirect("/dashboard");

  const [{ data: profiles }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    supabase.from("persona_assignments").select("*, personas(key,name,default_dashboard)").eq("tenant_id", tenantId).eq("is_active", true),
  ]);
  const assignmentByUser = new Map((assignments ?? []).map((item) => [item.user_id, item.personas as { key?: string; name?: string; default_dashboard?: string } | null]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="flex gap-2">
          <Button variant="outline">Invite User</Button>
          <Button asChild variant="outline"><Link href="/admin/settings">Settings</Link></Button>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Tenant Users</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-gray-500"><tr><th className="py-2">User</th><th>Role</th><th>Persona</th><th>Dashboard</th><th>Status</th></tr></thead>
            <tbody>
              {(profiles ?? []).map((row) => {
                const persona = assignmentByUser.get(row.id);
                return (
                  <tr key={row.id} className="border-b">
                    <td className="py-3"><div className="font-medium">{row.full_name ?? row.id}</div><div className="text-xs text-gray-500">{row.phone ?? "No phone"}</div></td>
                    <td><Badge variant="secondary">{row.role}</Badge></td>
                    <td>{persona?.name ?? "Fallback role persona"}</td>
                    <td className="text-gray-500">{persona?.default_dashboard ?? "role default"}</td>
                    <td><Badge variant="success">active</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!profiles?.length && <p className="py-8 text-center text-sm text-gray-500">No users found.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
