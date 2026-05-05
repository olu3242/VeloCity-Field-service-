import { z } from "zod";

export const serviceCategorySchema = z.enum([
  "plumbing",
  "electrical",
  "hvac",
  "cleaning",
  "landscaping",
  "pest_control",
  "appliance_repair",
  "locksmith",
  "handyman",
  "painting",
  "roofing",
  "flooring",
  "carpentry",
  "moving",
  "pool_service",
  "garage_door",
  "windows",
  "other",
]);

export const urgencySchema = z.enum(["scheduled", "same_day", "emergency"]);
export const jobStatusSchema = z.enum([
  "draft",
  "submitted",
  "awaiting_serviceability",
  "awaiting_match",
  "offer_sent",
  "accepted",
  "scheduled",
  "deposit_required",
  "deposit_paid",
  "en_route",
  "arrived",
  "diagnosis_in_progress",
  "quote_submitted",
  "awaiting_quote_approval",
  "quote_approved",
  "in_progress",
  "change_order_submitted",
  "awaiting_change_order_approval",
  "change_order_approved",
  "completed_pending_confirmation",
  "customer_confirmed",
  "completed",
  "disputed",
  "refund_pending",
  "refunded",
  "warranty_callback_open",
  "cancelled",
  "no_show",
  "expired",
  "closed",
]);

export const bookingSchema = z.object({
  category: serviceCategorySchema,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  urgency: urgencySchema,
  street: z.string().trim().min(3).max(160),
  unit: z.string().trim().max(40).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/),
  preferred_date: z.string().trim().optional(),
  preferred_time_start: z.string().trim().optional(),
  preferred_time_end: z.string().trim().optional(),
  photo_urls: z.array(z.string().url()).default([]),
});

export const providerApplicationSchema = z.object({
  business_name: z.string().trim().min(2).max(140),
  business_license: z.string().trim().max(120).optional().nullable(),
  insurance_number: z.string().trim().max(120).optional().nullable(),
  insurance_expiry: z.string().trim().optional().nullable(),
  categories: z.array(serviceCategorySchema).min(1),
  service_radius_miles: z.number().int().min(1).max(250),
  hourly_rate_cents: z.number().int().positive().optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  years_experience: z.number().int().min(0).max(80),
});

export const quoteLineItemSchema = z.object({
  description: z.string().trim().min(2).max(180),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().min(0),
  total_cents: z.number().int().min(0),
  type: z.enum(["labor", "parts", "travel", "other"]),
});

export const createQuoteSchema = z.object({
  job_id: z.string().uuid(),
  line_items: z.array(quoteLineItemSchema).min(1),
  notes: z.string().trim().max(2000).optional(),
  is_change_order: z.boolean().default(false),
  parent_quote_id: z.string().uuid().optional().nullable(),
});

export const quoteActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
});

export const dispatchSchema = z.object({
  job_id: z.string().uuid(),
  provider_id: z.string().uuid().optional(),
});

export const offerActionSchema = z.object({
  action: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(1000).optional(),
});

export const transitionSchema = z.object({
  to_status: jobStatusSchema,
  reason: z.string().trim().max(1000).optional(),
});

export const paymentIntentSchema = z.object({
  job_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  type: z.enum(["deposit", "final"]),
});

export const disputeSchema = z.object({
  job_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  evidence_urls: z.array(z.string().url()).default([]),
});

// ── Tips ────────────────────────────────────────────────────

export const tipSchema = z.object({
  job_id: z.string().uuid({ message: "job_id must be a valid UUID" }),
  amount_cents: z
    .number({ error: "amount_cents is required" })
    .int("amount_cents must be an integer")
    .min(100, "Minimum tip is $1.00")
    .max(100_000_00, "Maximum tip is $10,000"),
  note: z
    .string()
    .max(500, "Note must be 500 characters or fewer")
    .optional()
    .nullable(),
});

export type TipInput = z.infer<typeof tipSchema>;

export const reviewSchema = z.object({
  job_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

// ── Helpers ─────────────────────────────────────────────────

export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { success: false, error: messages };
}

export function validationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      error: "Invalid request body",
      details: error.flatten(),
    };
  }
  return { error: "Invalid request body" };
}
