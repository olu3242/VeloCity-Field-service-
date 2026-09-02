// Commercial Account Lifecycle (Batch X+3, Phase 5) — the only code path
// permitted to write commercial_* tables, mirroring the single-writer
// pattern established by src/lib/membership/membershipLifecycle.ts.

import { getAdminClient } from "@/lib/supabase/admin";

export async function createCommercialAccount(input: {
  name: string;
  accountType?: "commercial" | "franchise_partner" | "property_management";
  primaryContactId?: string;
}) {
  const db = getAdminClient();
  const { data, error } = await db
    .from("commercial_accounts")
    .insert({
      name: input.name,
      account_type: input.accountType ?? "commercial",
      primary_contact_id: input.primaryContactId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addCommercialLocation(input: {
  accountId: string;
  label?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  isPrimary?: boolean;
}) {
  const db = getAdminClient();
  const { data, error } = await db
    .from("commercial_locations")
    .insert({
      account_id: input.accountId,
      label: input.label ?? "Primary",
      street: input.street,
      unit: input.unit ?? null,
      city: input.city,
      state: input.state,
      zip: input.zip,
      is_primary: input.isPrimary ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createCommercialContract(input: {
  accountId: string;
  contractType: "sla" | "volume_commitment" | "custom_terms" | "franchise";
  billingFrequency?: "monthly" | "quarterly" | "annual";
  contractValueCents: number;
  slaResponseMinutes?: number;
  volumeCommitmentJobsPerPeriod?: number;
  startDate?: string;
  endDate?: string;
}) {
  const db = getAdminClient();
  const { data, error } = await db
    .from("commercial_contracts")
    .insert({
      account_id: input.accountId,
      contract_type: input.contractType,
      billing_frequency: input.billingFrequency ?? "monthly",
      contract_value_cents: input.contractValueCents,
      sla_response_minutes: input.slaResponseMinutes ?? null,
      volume_commitment_jobs_per_period: input.volumeCommitmentJobsPerPeriod ?? null,
      status: "active",
      start_date: input.startDate ?? new Date().toISOString().split("T")[0],
      end_date: input.endDate ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addCommercialServicePlan(input: {
  contractId: string;
  serviceTypeId: string;
  servicePackageId?: string;
  includedUsesPerPeriod?: number;
  period?: "monthly" | "quarterly" | "annual" | "contract_term";
}) {
  const db = getAdminClient();
  const { data, error } = await db
    .from("commercial_service_plans")
    .insert({
      contract_id: input.contractId,
      service_type_id: input.serviceTypeId,
      service_package_id: input.servicePackageId ?? null,
      included_uses_per_period: input.includedUsesPerPeriod ?? null,
      period: input.period ?? "monthly",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addCommercialContact(input: {
  accountId: string;
  profileId?: string;
  fullName: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
  isPrimary?: boolean;
}) {
  const db = getAdminClient();
  const { data, error } = await db
    .from("commercial_contacts")
    .insert({
      account_id: input.accountId,
      profile_id: input.profileId ?? null,
      full_name: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      role_title: input.roleTitle ?? null,
      is_primary: input.isPrimary ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Links a completed job (and its revenue record) back to the commercial
 * account/contract that generated it — the traceability step in
 * Customer/Account -> Contract -> Service Plan -> Booking -> Revenue Record.
 */
export async function recordCommercialJobUsage(input: { jobId: string; accountId: string; contractId: string }) {
  const db = getAdminClient();
  await db.from("jobs").update({ commercial_account_id: input.accountId, commercial_contract_id: input.contractId }).eq("id", input.jobId);
  await db.from("revenue_records").update({ commercial_account_id: input.accountId }).eq("job_id", input.jobId);
}

export async function markContractAtRisk(contractId: string) {
  const db = getAdminClient();
  const { data, error } = await db.from("commercial_contracts").update({ status: "at_risk" }).eq("id", contractId).select().single();
  if (error) throw error;
  return data;
}
