import type { ServiceCategory } from "@/types";
import type { PricingMode } from "./types";

export const CATEGORY_BASE_PRICE_CENTS: Record<ServiceCategory, number> = {
  plumbing: 12500,
  electrical: 13500,
  hvac: 16500,
  cleaning: 9000,
  landscaping: 11000,
  pest_control: 12000,
  appliance_repair: 14000,
  locksmith: 11500,
  handyman: 10000,
  painting: 18000,
  roofing: 25000,
  flooring: 22000,
  carpentry: 17500,
  moving: 20000,
  pool_service: 13000,
  garage_door: 15000,
  windows: 16000,
  other: 12000,
};

export const CATEGORY_PRICING_MODE: Partial<Record<ServiceCategory, PricingMode>> = {
  cleaning: "fixed_price",
  landscaping: "subscription_recurring",
  hvac: "diagnostic_fee",
  appliance_repair: "diagnostic_fee",
  plumbing: "deposit_plus_balance",
  electrical: "deposit_plus_balance",
  roofing: "quote_after_inspection",
  flooring: "quote_after_inspection",
};

export function getBasePrice(category: ServiceCategory) {
  return CATEGORY_BASE_PRICE_CENTS[category] ?? CATEGORY_BASE_PRICE_CENTS.other;
}

export function getPricingMode(category: ServiceCategory, emergency: boolean): PricingMode {
  if (emergency) return "emergency_dynamic";
  return CATEGORY_PRICING_MODE[category] ?? "quote_after_inspection";
}
