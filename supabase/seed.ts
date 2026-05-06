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
  { email: "superadmin@velocity.test", password: "velocity123", role: "admin", persona: "super_admin", fullName: "Sage Superadmin" },
  { email: "tenantadmin@velocity.test", password: "velocity123", role: "admin", persona: "tenant_admin", fullName: "Tara Tenant Admin" },
  { email: "dispatcher@velocity.test", password: "velocity123", role: "admin", persona: "dispatcher", fullName: "Devon Dispatcher" },
  { email: "finance@velocity.test", password: "velocity123", role: "admin", persona: "finance_admin", fullName: "Finley Finance" },
  { email: "providermanager@velocity.test", password: "velocity123", role: "admin", persona: "provider_manager", fullName: "Priya Provider Manager" },
  { email: "provider@velocity.test", password: "velocity123", role: "provider", persona: "provider", fullName: "Parker Provider" },
  { email: "customer@velocity.test", password: "velocity123", role: "customer", persona: "customer", fullName: "Casey Customer" },
  { email: "support@velocity.test", password: "velocity123", role: "admin", persona: "support_agent", fullName: "Sam Support" },
  { email: "auditor@velocity.test", password: "velocity123", role: "admin", persona: "auditor", fullName: "Ari Auditor" },
  { email: "automation@velocity.test", password: "velocity123", role: "admin", persona: "automation_operator", fullName: "Avery Automation" },
] as const;

const permissionObjects = [
  "users", "tenants", "profiles", "customers", "providers", "provider_documents", "services", "service_areas",
  "jobs", "job_events", "provider_offers", "quotes", "quote_line_items", "change_orders", "payments",
  "payment_ledger", "payouts", "payout_ledger", "refunds", "disputes", "reviews", "notifications",
  "automation_events", "automation_queue", "automation_runs", "agent_logs", "pricing_decisions",
  "growth_recommendations", "command_center", "launch_readiness", "settings", "audit_logs",
] as const;

const moduleKeys = [
  "admin_dashboard", "admin_jobs", "admin_providers", "admin_disputes", "admin_payments",
  "admin_payouts", "admin_automation", "admin_settings", "provider_dashboard", "provider_earnings", "customer_dashboard",
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
  await supabase.from("tenants").upsert({
    id: DEFAULT_TENANT_ID,
    slug: "velocity-default",
    name: "VeloCity Default Tenant",
  });

  const userIds = await Promise.all(demoUsers.map(upsertAuthUser));
  const userByPersona = Object.fromEntries(demoUsers.map((user, index) => [user.persona, userIds[index]]));
  const customerId = userByPersona.customer;
  const providerUserId = userByPersona.provider;
  const adminId = userByPersona.tenant_admin;

  const personas = [
    { key: "super_admin", name: "Super Admin", description: "Platform-wide access, tenant management, and global settings.", default_dashboard: "/admin/settings", tenant_id: null },
    { key: "tenant_admin", name: "Tenant Admin", description: "Full access within one tenant.", default_dashboard: "/admin/dashboard", tenant_id: DEFAULT_TENANT_ID },
    { key: "dispatcher", name: "Dispatcher", description: "Jobs, dispatch, providers, and status operations.", default_dashboard: "/admin/jobs", tenant_id: DEFAULT_TENANT_ID },
    { key: "finance_admin", name: "Finance Admin", description: "Payments, payouts, refunds, subscriptions, and ledgers.", default_dashboard: "/admin/payments", tenant_id: DEFAULT_TENANT_ID },
    { key: "provider_manager", name: "Provider Manager", description: "Provider approvals, suspensions, documents, and trust scores.", default_dashboard: "/admin/providers", tenant_id: DEFAULT_TENANT_ID },
    { key: "provider", name: "Provider", description: "Assigned jobs, offers, quotes, earnings, and reviews.", default_dashboard: "/provider/dashboard", tenant_id: DEFAULT_TENANT_ID },
    { key: "customer", name: "Customer", description: "Own bookings, payments, quotes, disputes, and reviews.", default_dashboard: "/dashboard", tenant_id: DEFAULT_TENANT_ID },
    { key: "support_agent", name: "Support Agent", description: "Support and dispute intake with limited finance visibility.", default_dashboard: "/admin/disputes", tenant_id: DEFAULT_TENANT_ID },
    { key: "auditor", name: "Auditor / Read-only", description: "Read-only tenant reporting and audit logs.", default_dashboard: "/admin/command-center", tenant_id: DEFAULT_TENANT_ID },
    { key: "automation_operator", name: "Automation Operator", description: "Automation queue, retries, and agent logs.", default_dashboard: "/admin/automation/logs", tenant_id: DEFAULT_TENANT_ID },
  ];

  for (const persona of personas) {
    await supabase.from("personas").upsert({
      tenant_id: persona.tenant_id,
      key: persona.key,
      name: persona.name,
      description: persona.description,
      is_system: true,
      default_dashboard: persona.default_dashboard,
      metadata: {},
    }, { onConflict: "tenant_id,key" });
  }

  const { data: seededPersonas } = await supabase.from("personas").select("*").or(`tenant_id.is.null,tenant_id.eq.${DEFAULT_TENANT_ID}`);
  const personaByKey = Object.fromEntries((seededPersonas ?? []).map((persona) => [persona.key, persona])) as Record<string, {
    id: string;
    tenant_id: string | null;
    key: string;
  }>;

  for (const user of demoUsers) {
    const persona = personaByKey[user.persona];
    if (!persona) continue;
    await supabase.from("persona_assignments").upsert({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: userByPersona[user.persona],
      persona_id: persona.id,
      is_active: true,
      assigned_by: adminId,
      metadata: { source: "seed" },
    }, { onConflict: "tenant_id,user_id,persona_id" });
  }

  for (const objectKey of permissionObjects) {
    await supabase.from("permission_objects").upsert({
      tenant_id: DEFAULT_TENANT_ID,
      object_key: objectKey,
      label: objectKey.replaceAll("_", " "),
      description: `Velocity object: ${objectKey}`,
      metadata: {},
    }, { onConflict: "tenant_id,object_key" });
  }

  const fieldRows = [
    ["profiles", "phone", "Customer/provider phone"],
    ["profiles", "email", "Customer/provider email"],
    ["profiles", "stripe_customer_id", "Stripe customer ID"],
    ["payments", "amount_cents", "Payment amount"],
    ["payments", "stripe_payment_intent_id", "Stripe payment intent ID"],
    ["payout_ledger", "metadata", "Payout account/internal metadata"],
    ["disputes", "evidence_urls", "Dispute evidence"],
    ["providers", "documents", "Provider documents"],
    ["providers", "trust_score", "Trust score internals"],
    ["agent_logs", "input", "AI agent prompts"],
    ["agent_logs", "output", "AI agent outputs"],
    ["audit_logs", "metadata", "Audit log metadata"],
    ["tenants", "settings", "Tenant settings"],
  ] as const;

  for (const [objectKey, fieldKey, label] of fieldRows) {
    await supabase.from("permission_fields").upsert({
      tenant_id: DEFAULT_TENANT_ID,
      object_key: objectKey,
      field_key: fieldKey,
      label,
      is_sensitive: true,
      metadata: {},
    }, { onConflict: "tenant_id,object_key,field_key" });
  }

  for (const persona of Object.values(personaByKey)) {
    const key = persona.key as string;
    for (const objectKey of permissionObjects) {
      const isTenantAdmin = key === "super_admin" || key === "tenant_admin";
      const financeObject = ["payments", "payment_ledger", "payouts", "payout_ledger", "refunds", "pricing_decisions"].includes(objectKey);
      const automationObject = ["automation_events", "automation_queue", "automation_runs", "agent_logs"].includes(objectKey);
      const dispatchObject = ["jobs", "provider_offers", "providers"].includes(objectKey);
      const providerObject = ["jobs", "provider_offers", "quotes", "reviews", "payout_ledger"].includes(objectKey);
      const customerObject = ["jobs", "quotes", "payments", "disputes", "reviews", "notifications"].includes(objectKey);
      const supportObject = ["jobs", "profiles", "customers", "disputes", "notifications"].includes(objectKey);
      const readAllowed = isTenantAdmin || key === "auditor" || (key === "finance_admin" && financeObject) || (key === "automation_operator" && automationObject) || (key === "dispatcher" && dispatchObject) || (key === "provider_manager" && ["providers", "provider_documents", "reviews"].includes(objectKey)) || (key === "provider" && providerObject) || (key === "customer" && customerObject) || (key === "support_agent" && supportObject);
      await supabase.from("persona_object_permissions").upsert({
        tenant_id: persona.tenant_id,
        persona_id: persona.id,
        object_key: objectKey,
        can_create: isTenantAdmin || ["dispatcher", "finance_admin", "support_agent", "provider", "customer"].includes(key),
        can_read: readAllowed,
        can_update: isTenantAdmin || ["dispatcher", "finance_admin", "provider_manager", "support_agent", "provider", "customer", "automation_operator"].includes(key),
        can_delete: isTenantAdmin,
        can_export: isTenantAdmin || key === "auditor" || key === "finance_admin",
        can_import: isTenantAdmin,
        can_assign: isTenantAdmin || key === "dispatcher",
        can_approve: isTenantAdmin || key === "provider_manager" || key === "finance_admin",
        can_reject: isTenantAdmin || key === "provider_manager" || key === "dispatcher",
        can_suspend: isTenantAdmin || key === "provider_manager",
        can_refund: isTenantAdmin || key === "finance_admin",
        can_release_payout: isTenantAdmin || key === "finance_admin",
        can_override: isTenantAdmin || key === "dispatcher",
        can_retry: isTenantAdmin || key === "automation_operator" || key === "finance_admin",
        can_view_sensitive: isTenantAdmin || key === "finance_admin" || key === "auditor",
        can_manage_settings: isTenantAdmin,
        metadata: { source: "seed" },
      }, { onConflict: "persona_id,object_key" });
    }

    for (const [objectKey, fieldKey] of fieldRows) {
      const canSeeSensitive = ["super_admin", "tenant_admin", "finance_admin", "auditor"].includes(key) || (key === "support_agent" && objectKey === "disputes");
      await supabase.from("persona_field_permissions").upsert({
        tenant_id: persona.tenant_id,
        persona_id: persona.id,
        object_key: objectKey,
        field_key: fieldKey,
        visible: true,
        editable: ["super_admin", "tenant_admin"].includes(key),
        masked: !canSeeSensitive,
        hidden: false,
        read_only: !["super_admin", "tenant_admin"].includes(key),
        required: false,
        metadata: { source: "seed" },
      }, { onConflict: "persona_id,object_key,field_key" });
    }

    for (const moduleKey of moduleKeys) {
      await supabase.from("module_permissions").upsert({
        tenant_id: persona.tenant_id,
        persona_id: persona.id,
        module_key: moduleKey,
        can_access: key === "super_admin" || key === "tenant_admin" || moduleKey.includes(key.split("_")[0]) || (key === "dispatcher" && moduleKey === "admin_jobs") || (key === "provider_manager" && moduleKey === "admin_providers") || (key === "automation_operator" && moduleKey === "admin_automation") || (key === "auditor" && moduleKey === "admin_dashboard") || (key === "support_agent" && moduleKey === "admin_disputes"),
        metadata: { source: "seed" },
      }, { onConflict: "persona_id,module_key" });
    }
  }

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

  const { data: quote, error: quoteError } = await supabase.from("quotes").insert({
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
  }).select().single();
  if (quoteError) throw quoteError;

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

  await supabase.from("pricing_decisions").insert({
    tenant_id: DEFAULT_TENANT_ID,
    job_id: job.id,
    customer_id: customerId,
    provider_id: provider.id,
    quote_id: quote.id,
    amount: 26521,
    currency: "usd",
    status: "validated",
    pricing_mode: "deposit_plus_balance",
    result: {
      basePrice: 22500,
      finalPrice: 26521,
      customerExplanation: "Demo quote is within deterministic range for local QA.",
      providerExplanation: "Line items reconcile with submitted labor and parts.",
      confidenceScore: 82,
    },
    risk_flags: [],
    metadata: { source: "seed" },
  });

  await supabase.from("payment_ledger").insert({
    tenant_id: DEFAULT_TENANT_ID,
    job_id: job.id,
    customer_id: customerId,
    provider_id: provider.id,
    amount: 7956,
    currency: "usd",
    status: "deposit_authorized",
    entry_type: "deposit",
    metadata: { source: "seed", mode: "local_fallback" },
  });

  await supabase.from("payout_ledger").insert({
    tenant_id: DEFAULT_TENANT_ID,
    job_id: job.id,
    customer_id: customerId,
    provider_id: provider.id,
    amount: 21621,
    currency: "usd",
    status: "payout_pending",
    retry_count: 0,
    metadata: { source: "seed", hold_reason: null },
  });

  const { data: automationEvent, error: eventError } = await supabase
    .from("automation_events")
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      event_type: "service_request_created",
      source: "seed",
      entity_type: "job",
      entity_id: job.id,
      actor_id: customerId,
      payload: { job_id: job.id, tenant_id: DEFAULT_TENANT_ID, seeded: true },
      dedup_key: `seed:service_request_created:${job.id}`,
    })
    .select()
    .single();
  if (eventError) throw eventError;

  await supabase.from("automation_queue").insert({
    tenant_id: DEFAULT_TENANT_ID,
    event_id: automationEvent.id,
    event_type: "service_request_created",
    status: "pending",
    payload: { job_id: job.id, tenant_id: DEFAULT_TENANT_ID, seeded: true },
    retry_count: 0,
    dedup_key: `seed:service_request_created:${job.id}`,
  });

  await supabase.from("disputes").insert({
    job_id: job.id,
    tenant_id: DEFAULT_TENANT_ID,
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
  demoUsers.forEach((user) => console.log(`${user.email} / velocity123`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
