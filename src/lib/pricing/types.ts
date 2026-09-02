import type { ServiceCategory, UrgencyLevel } from "@/types";

export type PricingMode =
  | "fixed_price"
  | "diagnostic_fee"
  | "quote_after_inspection"
  | "deposit_plus_balance"
  | "subscription_recurring"
  | "emergency_dynamic";

export interface PricingProfile {
  base_price_cents: number;
  labor_rate_cents: number;
  travel_fee_cents: number;
  urgency_multiplier: number;
  commercial_multiplier: number;
}

export interface PricingInput {
  category: ServiceCategory;
  urgency: UrgencyLevel;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  complexity?: "simple" | "moderate" | "complex";
  laborHours?: number;
  materialsEstimateCents?: number;
  quotedAmountCents?: number;
  subscription?: boolean;
  emergencyCapMultiplier?: number;
  isCommercial?: boolean;
  /** Optional service_pricing_profiles row, fetched by the caller. When
   * present, overrides the hardcoded CATEGORY_BASE_PRICE_CENTS/labor rate.
   * Falls back to the existing hardcoded pricing rules when absent. */
  pricingProfile?: PricingProfile;
}

export interface PricingResult {
  pricingMode: PricingMode;
  basePrice: number;
  laborAdjustment: number;
  materialsEstimate: number;
  urgencyAdjustment: number;
  locationAdjustment: number;
  complexityAdjustment: number;
  surgeAdjustment: number;
  platformFee: number;
  diagnosticFee: number;
  depositRequired: number;
  finalPrice: number;
  customerExplanation: string;
  providerExplanation: string;
  riskFlags: string[];
  confidenceScore: number;
}

export interface QuoteValidationResult {
  status: "approved" | "flagged" | "rejected";
  variancePercent: number;
  fairRange: { min: number; max: number };
  riskFlags: string[];
  customerExplanation: string;
  adminSummary: string;
}
