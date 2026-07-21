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
  service_type_id: z.string().uuid().optional().nullable(),
  service_package_id: z.string().uuid().optional().nullable(),
});

export const tenantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
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

export const providerProfileUpdateSchema = providerApplicationSchema.partial();

export const providerApprovalSchema = z.object({
  provider_id: z.string().uuid(),
  action: z.enum(["approve", "reject", "suspend"]),
  reason: z.string().trim().max(1000).optional(),
  required_documents_verified: z.boolean().optional(),
});

export const providerAvailabilitySchema = z.object({
  provider_id: z.string().uuid(),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  is_active: z.boolean().default(true),
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

export const changeOrderSchema = createQuoteSchema.extend({
  is_change_order: z.literal(true),
  parent_quote_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
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
  type: z.enum(["deposit", "final", "diagnostic", "preauth"]),
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

export const reviewCreateSchema = z.object({
  job_id: z.string().uuid(),
  reviewee_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const automationProcessSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  event_type: z.string().trim().max(120).optional(),
  retry_failed: z.boolean().default(false),
});

export const agentRunSchema = z.object({
  tenant_id: z.string().uuid(),
  agent_name: z.string().trim().min(2).max(80),
  input: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const messageCreateSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  attachments: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const checkInSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  status: z.enum(["arrived", "departed"]).default("arrived"),
});

export const photoUploadSchema = z.object({
  photo_type: z.enum(["before", "during", "after", "evidence"]),
});

export const jobCreateSchema = bookingSchema;
export const jobTransitionSchema = transitionSchema;
export const quoteSubmitSchema = createQuoteSchema;
export const disputeCreateSchema = disputeSchema;

export function validationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      error: "Invalid request body",
      details: error.flatten(),
    };
  }
  return { error: "Invalid request body" };
}

// ---------------------------------------------------------------------------
// Plain-TypeScript runtime validators (no Zod, safe for edge/worker contexts)
// ---------------------------------------------------------------------------

/**
 * Thrown by `validateBody` when a field fails its rule.
 * Consumers can inspect `.field` and `.rule` to build structured error
 * responses without depending on Zod's shape.
 */
export class ValidationError extends Error {
  constructor(
    public field: string,
    public rule: string,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ValidationRule<T> {
  validate(value: unknown): value is T;
  message: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;

export const validators = {
  /** Any string (including empty). */
  string(): ValidationRule<string> {
    return {
      validate(value): value is string {
        return typeof value === "string";
      },
      message: "must be a string",
    };
  },

  /** Non-empty string after trimming. */
  nonEmptyString(): ValidationRule<string> {
    return {
      validate(value): value is string {
        return typeof value === "string" && value.trim().length > 0;
      },
      message: "must be a non-empty string",
    };
  },

  /** UUID v4 format. */
  uuid(): ValidationRule<string> {
    return {
      validate(value): value is string {
        return typeof value === "string" && UUID_RE.test(value);
      },
      message: "must be a valid UUID v4",
    };
  },

  /** Integer greater than zero. */
  positiveInteger(): ValidationRule<number> {
    return {
      validate(value): value is number {
        return (
          typeof value === "number" &&
          Number.isFinite(value) &&
          Number.isInteger(value) &&
          value > 0
        );
      },
      message: "must be a positive integer",
    };
  },

  /** Basic e-mail format. */
  email(): ValidationRule<string> {
    return {
      validate(value): value is string {
        return typeof value === "string" && EMAIL_RE.test(value);
      },
      message: "must be a valid email address",
    };
  },

  /** http:// or https:// URL. */
  url(): ValidationRule<string> {
    return {
      validate(value): value is string {
        return typeof value === "string" && URL_RE.test(value);
      },
      message: "must be a valid URL starting with http:// or https://",
    };
  },

  /** Value must be one of the provided string literals. */
  enum<T extends string>(values: readonly T[]): ValidationRule<T> {
    const set = new Set<string>(values);
    return {
      validate(value): value is T {
        return typeof value === "string" && set.has(value);
      },
      message: `must be one of: ${values.join(", ")}`,
    };
  },

  /**
   * Wraps another validator to also allow `undefined` (field may be absent).
   * `null` is NOT treated as `undefined`.
   */
  optional<T>(inner: ValidationRule<T>): ValidationRule<T | undefined> {
    return {
      validate(value): value is T | undefined {
        return value === undefined || inner.validate(value);
      },
      message: `(optional) ${inner.message}`,
    };
  },
};

/**
 * Validate an arbitrary request body against a typed schema.
 * Throws `ValidationError` on the first failing field.
 *
 * @example
 * const body = validateBody(await req.json(), {
 *   jobId:  validators.uuid(),
 *   amount: validators.positiveInteger(),
 *   status: validators.enum(["pending", "completed"] as const),
 * });
 */
export function validateBody<T extends Record<string, unknown>>(
  body: unknown,
  schema: { [K in keyof T]: ValidationRule<T[K]> },
): T {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("body", "object", "Request body must be a JSON object");
  }

  const input = body as Record<string, unknown>;

  for (const key of Object.keys(schema) as Array<keyof T & string>) {
    const rule = schema[key];
    const value = input[key];

    if (!rule.validate(value)) {
      throw new ValidationError(key, rule.message, `Field "${key}": ${rule.message}`);
    }
  }

  return input as T;
}
