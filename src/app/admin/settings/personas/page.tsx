import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission } from "@/lib/access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminSettingsPersonasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "settings", action: "manage_settings", route: "/admin/settings/personas" });
  if (!access.allowed) redirect("/dashboard");
  const { data: personas } = await supabase.from("personas").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).order("name");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Personas</h1>
        <div className="flex gap-2"><Button variant="outline">Create Custom Persona</Button><Button asChild variant="outline"><Link href="/admin/settings">Settings</Link></Button></div>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        {(personas ?? []).map((persona) => (
          <Card key={persona.id}>
            <CardHeader><CardTitle className="flex items-center justify-between">{persona.name}<Badge variant={persona.is_system ? "secondary" : "outline"}>{persona.is_system ? "system" : "custom"}</Badge></CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">{persona.description}</p>
              <div className="mt-3 text-xs text-gray-500">Default dashboard: {persona.default_dashboard ?? "not set"}</div>
              <div className="mt-4 flex gap-2"><Button size="sm" variant="outline">Clone</Button><Button size="sm" variant="outline">Edit Description</Button></div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
