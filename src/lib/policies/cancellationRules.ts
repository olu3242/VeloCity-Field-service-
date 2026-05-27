export function calculateCancellationPolicy(input: { status: string; actorRole: string; quotedCostCents?: number | null }) {
  if (input.actorRole === "customer" && ["draft", "submitted", "awaiting_match", "offer_sent"].includes(input.status)) {
    return { feeCents: 0, event: "customer_cancel_before_accept", reason: "Cancellation before provider acceptance is free." };
  }
  if (input.actorRole === "customer") {
    return { feeCents: Math.min(5000, Math.round((input.quotedCostCents ?? 0) * 0.1)), event: "cancellation_fee_applied", reason: "Late cancellation after provider commitment." };
  }
  return { feeCents: 0, event: "job_cancelled", reason: "No customer cancellation fee applies." };
}
