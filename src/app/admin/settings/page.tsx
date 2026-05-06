import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "settings", action: "manage_settings", route: "/admin/settings" });
  if (!access.allowed) redirect("/dashboard");

  const [{ count: personas }, { count: assignments }, { count: denied }, { count: changes }] = await Promise.all([
    supabase.from("personas").select("*", { count: "exact", head: true }).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`),
    supabase.from("persona_assignments").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
    supabase.from("access_audit_logs").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("decision", "denied"),
    supabase.from("settings_audit_logs").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);

  const sections = [
    { title: "Users", href: "/admin/settings/users", body: "Invite users, assign personas, and review access summaries." },
    { title: "Personas", href: "/admin/settings/personas", body: "Manage default and custom tenant personas." },
    { title: "Permissions", href: "/admin/settings/permissions", body: "Object, field, action, and module permission matrices." },
    { title: "Audit", href: "/admin/settings/audit", body: "Denied access attempts and settings change logs." },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Access Settings</h1>
          <p className="text-sm text-gray-500">Tenant-aware personas, permissions, and access audit controls.</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/dashboard">Admin</Link></Button>
      </div>
      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{personas ?? 0}</div><div className="text-sm text-gray-500">Personas</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{assignments ?? 0}</div><div className="text-sm text-gray-500">Active Assignments</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-red-700">{denied ?? 0}</div><div className="text-sm text-gray-500">Denied Attempts</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-bold">{changes ?? 0}</div><div className="text-sm text-gray-500">Settings Changes</div></CardContent></Card>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.href}>
            <CardHeader><CardTitle>{section.title}</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-gray-500">{section.body}</p>
              <Button asChild><Link href={section.href}>Open</Link></Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
