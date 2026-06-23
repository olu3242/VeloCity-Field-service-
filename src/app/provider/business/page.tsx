import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BusinessProfileForm, type BusinessProfileFormValues } from "@/components/provider/business-profile-form";
import { ProviderDocumentsList } from "@/components/related-lists/ProviderDocumentsList";
import type { ServiceCategory } from "@/types";

interface ProviderRow extends BusinessProfileFormValues {
  id: string;
  tenant_id: string;
  status: string;
  trust_score: number | null;
  completed_jobs: number | null;
  cancellation_rate: number | null;
  response_time_minutes: number | null;
}

export default async function ProviderBusinessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: providerRaw } = await supabase
    .from("providers")
    .select(
      "id, tenant_id, status, business_name, business_license, insurance_number, insurance_expiry, categories, service_radius_miles, hourly_rate_cents, bio, years_experience, trust_score, completed_jobs, cancellation_rate, response_time_minutes"
    )
    .eq("user_id", user.id)
    .single();

  if (!providerRaw) redirect("/provider/apply");
  const provider = providerRaw as unknown as ProviderRow;

  const initial: BusinessProfileFormValues = {
    business_name: provider.business_name,
    business_license: provider.business_license,
    insurance_number: provider.insurance_number,
    insurance_expiry: provider.insurance_expiry,
    categories: (provider.categories ?? []) as ServiceCategory[],
    service_radius_miles: provider.service_radius_miles,
    hourly_rate_cents: provider.hourly_rate_cents,
    bio: provider.bio,
    years_experience: provider.years_experience,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/provider/dashboard" className="text-sm text-gray-500 hover:text-gray-700 mb-3 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Business Profile</h1>
            <p className="text-sm text-gray-500">Manage your services, coverage area, licenses, and insurance.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/provider/earnings">Earnings</Link></Button>
            {provider.status !== "approved" && <Badge variant="warning">Status: {provider.status}</Badge>}
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader><CardTitle>Performance Snapshot</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-velocity-700">
                  {provider.trust_score != null ? Math.round(provider.trust_score * 100) : "—"}
                </div>
                <div className="text-xs text-gray-500">Trust Score</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{provider.completed_jobs ?? 0}</div>
                <div className="text-xs text-gray-500">Completed Jobs</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {provider.cancellation_rate != null ? `${Math.round(provider.cancellation_rate * 100)}%` : "—"}
                </div>
                <div className="text-xs text-gray-500">Cancellation Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {provider.response_time_minutes != null ? `${provider.response_time_minutes}m` : "—"}
                </div>
                <div className="text-xs text-gray-500">Avg Response Time</div>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-400">
              Detailed forecasts and plan recommendations are available on the{" "}
              <Link href="/provider/dashboard" className="underline">Provider Dashboard</Link>.
            </p>
          </CardContent>
        </Card>

        <BusinessProfileForm initial={initial} />

        <div className="mt-6">
          <ProviderDocumentsList tenantId={provider.tenant_id} providerId={provider.id} />
          <p className="mt-2 text-xs text-gray-400">
            Document uploads are managed by the application team during onboarding. Self-service uploads are not yet available.
          </p>
        </div>
      </div>
    </div>
  );
}
