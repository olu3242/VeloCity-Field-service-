import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { JobStatus, ServiceCategory, UrgencyLevel } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function formatTimeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function generateOTP(length = 6): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function platformFeePercent(amountCents: number): number {
  if (amountCents < 10000) return 0.2;
  if (amountCents < 50000) return 0.18;
  return 0.15;
}

export function calculatePlatformFee(amountCents: number): number {
  return Math.round(amountCents * platformFeePercent(amountCents));
}

// ============================================================
// LABEL MAPS
// ============================================================

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  awaiting_serviceability: "Checking Availability",
  awaiting_match: "Finding Providers",
  offer_sent: "Offer Sent",
  accepted: "Accepted",
  scheduled: "Scheduled",
  deposit_required: "Deposit Required",
  deposit_paid: "Deposit Paid",
  en_route: "Provider En Route",
  arrived: "Provider Arrived",
  diagnosis_in_progress: "Diagnosing",
  quote_submitted: "Quote Ready",
  awaiting_quote_approval: "Awaiting Your Approval",
  quote_approved: "Quote Approved",
  in_progress: "In Progress",
  change_order_submitted: "Change Order Requested",
  awaiting_change_order_approval: "Awaiting Change Approval",
  change_order_approved: "Change Order Approved",
  completed_pending_confirmation: "Pending Confirmation",
  customer_confirmed: "Confirmed",
  completed: "Completed",
  disputed: "Disputed",
  refund_pending: "Refund Pending",
  refunded: "Refunded",
  warranty_callback_open: "Warranty Callback",
  cancelled: "Cancelled",
  no_show: "No Show",
  expired: "Expired",
  closed: "Closed",
};

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  awaiting_serviceability: "bg-blue-100 text-blue-700",
  awaiting_match: "bg-yellow-100 text-yellow-700",
  offer_sent: "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  scheduled: "bg-green-100 text-green-700",
  deposit_required: "bg-orange-100 text-orange-700",
  deposit_paid: "bg-green-100 text-green-700",
  en_route: "bg-violet-100 text-violet-700",
  arrived: "bg-violet-100 text-violet-700",
  diagnosis_in_progress: "bg-violet-100 text-violet-700",
  quote_submitted: "bg-orange-100 text-orange-700",
  awaiting_quote_approval: "bg-orange-100 text-orange-700",
  quote_approved: "bg-green-100 text-green-700",
  in_progress: "bg-blue-100 text-blue-700",
  change_order_submitted: "bg-orange-100 text-orange-700",
  awaiting_change_order_approval: "bg-orange-100 text-orange-700",
  change_order_approved: "bg-green-100 text-green-700",
  completed_pending_confirmation: "bg-teal-100 text-teal-700",
  customer_confirmed: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-800",
  disputed: "bg-red-100 text-red-700",
  refund_pending: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-700",
  warranty_callback_open: "bg-purple-100 text-purple-700",
  cancelled: "bg-gray-100 text-gray-500",
  no_show: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
  closed: "bg-gray-100 text-gray-500",
};

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  cleaning: "Cleaning",
  landscaping: "Landscaping",
  pest_control: "Pest Control",
  appliance_repair: "Appliance Repair",
  locksmith: "Locksmith",
  handyman: "Handyman",
  painting: "Painting",
  roofing: "Roofing",
  flooring: "Flooring",
  carpentry: "Carpentry",
  moving: "Moving",
  pool_service: "Pool Service",
  garage_door: "Garage Door",
  windows: "Windows",
  other: "Other",
};

export const SERVICE_CATEGORY_ICONS: Record<ServiceCategory, string> = {
  plumbing: "🔧",
  electrical: "⚡",
  hvac: "❄️",
  cleaning: "🧹",
  landscaping: "🌿",
  pest_control: "🐛",
  appliance_repair: "🔌",
  locksmith: "🔑",
  handyman: "🔨",
  painting: "🎨",
  roofing: "🏠",
  flooring: "🪵",
  carpentry: "🪚",
  moving: "📦",
  pool_service: "🏊",
  garage_door: "🚗",
  windows: "🪟",
  other: "🛠️",
};

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  scheduled: "Schedule for Later",
  same_day: "Same Day",
  emergency: "Emergency (1-2 hrs)",
};

export const URGENCY_SURCHARGE: Record<UrgencyLevel, number> = {
  scheduled: 0,
  same_day: 0.15,
  emergency: 0.5,
};
