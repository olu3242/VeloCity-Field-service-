import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { checkPermission, OBJECT_ACTIONS, PERMISSION_OBJECTS, SENSITIVE_FIELDS } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminSettingsPermissionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  const tenantId = getTenantId(profile);
  const access = await checkPermission({ tenantId, userId: user.id, object: "settings", action: "manage_settings", route: "/admin/settings/permissions" });
  if (!access.allowed) redirect("/dashboard");

  const [{ data: personas }, { data: objectPermissions }, { data: fieldPermissions }] = await Promise.all([
    supabase.from("personas").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).order("name"),
    supabase.from("persona_object_permissions").select("*, personas(key,name)").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).limit(1000),
    supabase.from("persona_field_permissions").select("*, personas(key,name)").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).limit(1000),
  ]);
  const selectedPersona = personas?.[0];
  const objectRows = (objectPermissions ?? []).filter((row) => row.persona_id === selectedPersona?.id);
  const fieldRows = (fieldPermissions ?? []).filter((row) => row.persona_id === selectedPersona?.id);
  const objectMap = new Map(objectRows.map((row) => [row.object_key, row]));
  const fieldMap = new Map(fieldRows.map((row) => [`${row.object_key}.${row.field_key}`, row]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Permissions</h1><p className="text-sm text-gray-500">Matrix preview for {selectedPersona?.name ?? "first persona"}.</p></div>
        <Button asChild variant="outline"><Link href="/admin/settings">Settings</Link></Button>
      </div>
      <Card className="mb-6">
        <CardHeader><CardTitle>Object Permission Matrix</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs">
            <thead><tr className="border-b text-left"><th className="py-2">Object</th>{OBJECT_ACTIONS.map((action) => <th key={action} className="px-2">{action}</th>)}</tr></thead>
            <tbody>
              {PERMISSION_OBJECTS.map((object) => {
                const row = objectMap.get(object) as Record<string, boolean> | undefined;
                return <tr key={object} className="border-b"><td className="py-2 font-medium">{object}</td>{OBJECT_ACTIONS.map((action) => <td key={action} className="px-2"><input type="checkbox" readOnly checked={Boolean(row?.[`can_${action}`])} /></td>)}</tr>;
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Field Permission Matrix</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-left"><th className="py-2">Field</th><th>Visible</th><th>Editable</th><th>Masked</th><th>Hidden</th></tr></thead>
            <tbody>
              {SENSITIVE_FIELDS.map((field) => {
                const row = fieldMap.get(`${field.object}.${field.field}`) as Record<string, boolean> | undefined;
                return <tr key={`${field.object}.${field.field}`} className="border-b"><td className="py-2 font-medium">{field.label}</td><td><input type="checkbox" readOnly checked={Boolean(row?.visible)} /></td><td><input type="checkbox" readOnly checked={Boolean(row?.editable)} /></td><td><input type="checkbox" readOnly checked={Boolean(row?.masked)} /></td><td><input type="checkbox" readOnly checked={Boolean(row?.hidden)} /></td></tr>;
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}
