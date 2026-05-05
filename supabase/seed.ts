import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

dotenv.config({ path: ".env.local" });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Seed requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});

const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";

const demoUsers = [
  { email: "customer@velocity.dev", password: "velocity123", role: "customer", fullName: "Casey Customer" },
  { email: "provider@velocity.dev", password: "velocity123", role: "provider", fullName: "Parker Provider" },
  { email: "admin@velocity.dev", password: "velocity123", role: "admin", fullName: "Ari Admin" },
] as const;

async function upsertAuthUser(user: (typeof demoUsers)[number]) {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing.users.find((item) => item.email === user.email);

  if (found) {
    await supabase.from("profiles").upsert({
      id: found.id,
      tenant_id: DEFAULT_TENANT_ID,
      role: user.role,
      full_name: user.fullName,
      phone: "+15555550100",
      avatar_url: null,
      stripe_customer_id: null,
      metadata: {},
    });
    return found.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  });

  if (error || !data.user) throw error ?? new Error(`Unable to create ${user.email}`);

  await supabase.from("profiles").upsert({
    id: data.user.id,
    tenant_id: DEFAULT_TENANT_ID,
    role: user.role,
    full_name: user.fullName,
    phone: "+15555550100",
    avatar_url: null,
    stripe_customer_id: null,
    metadata: {},
  });

  return data.user.id;
}

async function main() {
  const [customerId, providerUserId, adminId] = await Promise.all(demoUsers.map(upsertAuthUser));

  await supabase.from("tenants").upsert({
    id: DEFAULT_TENANT_ID,
    slug: "velocity-default",
    name: "VeloCity Default Tenant",
    status: "active",
    metadata: {},
  });

  const { data: serviceArea, error: areaError } = await supabase
    .from("service_areas")
    .upsert(
      {
        tenant_id: DEFAULT_TENANT_ID,
        name: "Greater Austin",
        city: "Austin",
        state: "TX",
        zip_codes: ["78701", "78702", "78703", "78704", "78745"],
        is_active: true,
      },
      { onConflict: "name" }
    )
    .select()
    .single();
  if (areaError) throw areaError;

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .upsert(
      {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: providerUserId,
        business_name: "Velocity Demo Plumbing",
        business_license: "TX-DEMO-123",
        insurance_number: "INS-DEMO-123",
        insurance_expiry: "2027-12-31",
        categories: ["plumbing", "handyman"],
        service_area_ids: [serviceArea.id],
        service_radius_miles: 35,
        hourly_rate_cents: 9500,
        bio: "Demo approved provider for local MVP testing.",
        years_experience: 8,
        status: "approved",
        trust_score: 0.92,
        completed_jobs: 24,
        cancellation_rate: 0.02,
        response_time_minutes: 12,
        stripe_account_id: null,
        stripe_account_status: null,
        is_online: true,
        last_location: null,
        documents: [],
        admin_notes: "Seed provider.",
        approved_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (providerError) throw providerError;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: customerId,
      tenant_id: DEFAULT_TENANT_ID,
      provider_id: provider.id,
      category: "plumbing",
      title: "Leaking kitchen faucet",
      description: "Water leaks under the kitchen sink when the faucet runs.",
      urgency: "same_day",
      status: "accepted",
      address_id: null,
      street: "123 Main St",
      unit: null,
      city: "Austin",
      state: "TX",
      zip: "78701",
      location: null,
      preferred_date: new Date().toISOString().slice(0, 10),
      preferred_time_start: null,
      preferred_time_end: null,
      scheduled_start: null,
      scheduled_end: null,
      actual_start: null,
      actual_end: null,
      photo_urls: [],
      document_urls: [],
      estimated_cost_cents: 22500,
      quoted_cost_cents: 24500,
      final_cost_cents: null,
      deposit_amount_cents: 7350,
      platform_fee_cents: 4900,
      checkin_otp: null,
      checkin_otp_expires_at: null,
      checked_in_at: null,
      ai_classification: { category: "plumbing", urgency: "same_day", confidence: 0.6 },
      ai_match_scores: { [provider.id]: 0.92 },
      internal_notes: "Seed job.",
      customer_notes: null,
      provider_notes: null,
    })
    .select()
    .single();
  if (jobError) throw jobError;

  await supabase.from("quotes").insert({
    job_id: job.id,
    tenant_id: DEFAULT_TENANT_ID,
    provider_id: provider.id,
    is_change_order: false,
    parent_quote_id: null,
    line_items: [{ description: "Labor and minor parts", quantity: 1, unit_price_cents: 24500, total_cents: 24500, type: "labor" }],
    subtotal_cents: 24500,
    tax_cents: 2021,
    total_cents: 26521,
    deposit_required_cents: 7956,
    notes: "Demo quote.",
    valid_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    approved_at: null,
    rejected_at: null,
  });

  await supabase.from("provider_offers").upsert({
    job_id: job.id,
    tenant_id: DEFAULT_TENANT_ID,
    provider_id: provider.id,
    match_score: 0.92,
    ai_reasoning: "Seeded provider is online, approved, and matches plumbing.",
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });

  await supabase.from("notifications").insert([
    {
      user_id: customerId,
      tenant_id: DEFAULT_TENANT_ID,
      channel: "in_app",
      title: "Demo job created",
      body: "Your seeded plumbing job is ready for QA.",
      data: { job_id: job.id },
      is_read: false,
      sent_at: new Date().toISOString(),
    },
    {
      user_id: providerUserId,
      tenant_id: DEFAULT_TENANT_ID,
      channel: "in_app",
      title: "Demo job assigned",
      body: "You have a seeded job assigned for QA.",
      data: { job_id: job.id },
      is_read: false,
      sent_at: new Date().toISOString(),
    },
  ]);

  await supabase.from("agent_logs").insert({
    agent_name: "ALICE",
    tenant_id: DEFAULT_TENANT_ID,
    job_id: job.id,
    user_id: customerId,
    action: "Seed fallback intake",
    input: { title: job.title },
    output: { fallback: true, category: "plumbing" },
    tokens_used: 0,
    latency_ms: 0,
    error: null,
  });

  await supabase.from("disputes").insert({
    job_id: job.id,
    initiated_by: customerId,
    against: providerUserId,
    status: "under_review",
    reason: "Demo dispute",
    description: "Seed dispute for admin QA.",
    evidence_urls: [],
    resolution_notes: null,
    refund_amount_cents: null,
    ai_recommendation: { recommendation: "needs_review", confidence: 0.5 },
    resolved_by: adminId,
    resolved_at: null,
  });

  console.log("Seed complete");
  console.log("customer@velocity.dev / velocity123");
  console.log("provider@velocity.dev / velocity123");
  console.log("admin@velocity.dev / velocity123");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
