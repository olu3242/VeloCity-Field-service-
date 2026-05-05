// VeloCity Field Service — Core Types

export type UserRole = "customer" | "provider" | "admin";

export type ProviderStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "suspended"
  | "rejected";

export type JobStatus =
  | "draft"
  | "submitted"
  | "awaiting_serviceability"
  | "awaiting_match"
  | "offer_sent"
  | "accepted"
  | "scheduled"
  | "deposit_required"
  | "deposit_paid"
  | "en_route"
  | "arrived"
  | "diagnosis_in_progress"
  | "quote_submitted"
  | "awaiting_quote_approval"
  | "quote_approved"
  | "in_progress"
  | "change_order_submitted"
  | "awaiting_change_order_approval"
  | "change_order_approved"
  | "completed_pending_confirmation"
  | "customer_confirmed"
  | "completed"
  | "disputed"
  | "refund_pending"
  | "refunded"
  | "warranty_callback_open"
  | "cancelled"
  | "no_show"
  | "expired"
  | "closed";

export type UrgencyLevel = "scheduled" | "same_day" | "emergency";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "escrowed"
  | "released"
  | "refunded"
  | "failed"
  | "cancelled";

export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved_for_customer"
  | "resolved_for_provider"
  | "escalated"
  | "closed";

export type ServiceCategory =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "cleaning"
  | "landscaping"
  | "pest_control"
  | "appliance_repair"
  | "locksmith"
  | "handyman"
  | "painting"
  | "roofing"
  | "flooring"
  | "carpentry"
  | "moving"
  | "pool_service"
  | "garage_door"
  | "windows"
  | "other";

export type NotificationChannel = "sms" | "email" | "push" | "in_app";

// ============================================================
// ENTITIES
// ============================================================

export interface Profile {
  id: string;
  tenant_id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  tenant_id: string;
  user_id: string;
  business_name: string;
  business_license: string | null;
  insurance_number: string | null;
  insurance_expiry: string | null;
  categories: ServiceCategory[];
  service_area_ids: string[];
  service_radius_miles: number;
  hourly_rate_cents: number | null;
  bio: string | null;
  years_experience: number;
  status: ProviderStatus;
  trust_score: number;
  completed_jobs: number;
  cancellation_rate: number;
  response_time_minutes: number | null;
  stripe_account_id: string | null;
  stripe_account_status: string | null;
  is_online: boolean;
  last_location: { x: number; y: number } | null;
  documents: ProviderDocument[];
  admin_notes: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface ProviderDocument {
  type: "license" | "insurance" | "background_check" | "certification" | "other";
  url: string;
  name: string;
  uploaded_at: string;
  verified: boolean;
}

export interface CustomerAddress {
  id: string;
  tenant_id: string;
  customer_id: string;
  label: string;
  street: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  location: { x: number; y: number } | null;
  is_default: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  tenant_id: string;
  customer_id: string;
  provider_id: string | null;
  category: ServiceCategory;
  title: string;
  description: string;
  urgency: UrgencyLevel;
  status: JobStatus;
  address_id: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  location: { x: number; y: number } | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  photo_urls: string[];
  document_urls: string[];
  estimated_cost_cents: number | null;
  quoted_cost_cents: number | null;
  final_cost_cents: number | null;
  deposit_amount_cents: number | null;
  platform_fee_cents: number | null;
  checkin_otp: string | null;
  checkin_otp_expires_at: string | null;
  checked_in_at: string | null;
  ai_classification: AIClassification;
  ai_match_scores: Record<string, number>;
  internal_notes: string | null;
  customer_notes: string | null;
  provider_notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: Profile;
  provider?: Provider;
  quotes?: Quote[];
  payments?: Payment[];
}

export interface AIClassification {
  category?: ServiceCategory;
  urgency?: UrgencyLevel;
  complexity?: "simple" | "moderate" | "complex";
  estimated_duration_hours?: number;
  estimated_cost_range?: { min: number; max: number };
  skills_required?: string[];
  confidence?: number;
}

export interface JobStatusHistory {
  id: string;
  tenant_id: string;
  job_id: string;
  from_status: JobStatus | null;
  to_status: JobStatus;
  actor_id: string | null;
  actor_role: UserRole | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Quote {
  id: string;
  tenant_id: string;
  job_id: string;
  provider_id: string;
  is_change_order: boolean;
  parent_quote_id: string | null;
  line_items: QuoteLineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_required_cents: number;
  notes: string | null;
  valid_until: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
}

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  type: "labor" | "parts" | "travel" | "other";
}

export interface Payment {
  id: string;
  tenant_id: string;
  job_id: string;
  customer_id: string;
  provider_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  provider_payout_cents: number;
  currency: string;
  status: PaymentStatus;
  type: "deposit" | "final" | "refund";
  metadata: Record<string, unknown>;
  captured_at: string | null;
  payout_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  tenant_id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  response: string | null;
  is_public: boolean;
  created_at: string;
  reviewer?: Profile;
}

export interface Dispute {
  id: string;
  tenant_id: string;
  job_id: string;
  initiated_by: string;
  against: string;
  status: DisputeStatus;
  reason: string;
  description: string | null;
  evidence_urls: string[];
  resolution_notes: string | null;
  refund_amount_cents: number | null;
  ai_recommendation: AIDisputeRecommendation;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIDisputeRecommendation {
  recommendation?: "refund_customer" | "pay_provider" | "split" | "needs_review";
  confidence?: number;
  reasoning?: string;
  suggested_refund_percent?: number;
}

export interface ProviderOffer {
  id: string;
  tenant_id: string;
  job_id: string;
  provider_id: string;
  match_score: number | null;
  ai_reasoning: string | null;
  offered_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  provider?: Provider;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  customer_id: string;
  provider_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  category: ServiceCategory | null;
  plan_name: string;
  interval: "weekly" | "monthly" | "quarterly";
  amount_cents: number;
  status: string;
  next_service_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ServiceArea {
  id: string;
  tenant_id: string;
  name: string;
  city: string;
  state: string;
  zip_codes: string[];
  is_active: boolean;
  created_at: string;
}

// ============================================================
// AI AGENTS
// ============================================================

export type AgentName =
  | "ALICE"
  | "MAX"
  | "QUINN"
  | "NOVA"
  | "REX"
  | "IVY"
  | "FINN"
  | "LENA"
  | "TESS"
  | "GABRIEL";

export interface AgentLog {
  id: string;
  tenant_id: string;
  agent_name: AgentName;
  job_id: string | null;
  user_id: string | null;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  tokens_used: number | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

// ============================================================
// API TYPES
// ============================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// ============================================================
// FORM TYPES
// ============================================================

export interface BookingFormData {
  category: ServiceCategory;
  title: string;
  description: string;
  urgency: UrgencyLevel;
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  preferred_date?: string;
  preferred_time_start?: string;
  preferred_time_end?: string;
  photo_urls: string[];
}

export interface ProviderApplicationData {
  business_name: string;
  business_license?: string;
  insurance_number?: string;
  insurance_expiry?: string;
  categories: ServiceCategory[];
  service_radius_miles: number;
  hourly_rate_cents?: number;
  bio?: string;
  years_experience: number;
}

// ============================================================
// DASHBOARD / ANALYTICS
// ============================================================

export interface AdminKPIs {
  total_jobs_today: number;
  active_jobs: number;
  completed_jobs_today: number;
  revenue_today_cents: number;
  new_customers_today: number;
  active_providers: number;
  avg_response_time_minutes: number;
  open_disputes: number;
  sla_breach_risk: number;
}

export interface ProviderDashboardData {
  pending_offers: number;
  active_jobs: number;
  completed_today: number;
  earnings_today_cents: number;
  earnings_week_cents: number;
  trust_score: number;
  avg_rating: number;
  upcoming_jobs: Job[];
}
