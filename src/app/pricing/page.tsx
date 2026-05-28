import { InfoPage } from "@/components/marketplace";

export default function PricingPage() {
  return (
    <InfoPage
      eyebrow="// PRICING"
      title="Transparent estimates before provider dispatch."
      description="Pricing starts with category previews, then QUINN can structure diagnostic quotes, line items, deposits, escrow, and final payment flows."
      bullets={[
        "Service pages expose category-level starting prices and ETA expectations.",
        "Job quotes can move through approval states before payment capture and provider payout.",
        "Stripe payment intent and webhook routes are present, with live verification blocked until real credentials are configured.",
      ]}
      cta={{ label: "Book and Preview", href: "/book" }}
    />
  );
}
