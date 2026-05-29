import { InfoPage } from "@/components/marketplace";

export default function RefundPolicyPage() {
  return (
    <InfoPage
      eyebrow="// REFUNDS"
      title="Refund Policy"
      description="Refunds are reviewed through VeloCity support, payment, and dispute workflows to protect customers, providers, and marketplace auditability."
      bullets={[
        "Refund eligibility depends on job status, approved scope, provider arrival, documented work, customer acceptance, cancellation timing, and dispute evidence.",
        "Approved refunds may be partial or full and can affect provider payouts, reserves, adjustments, ratings, and quality review records.",
        "Payment processor fees, chargebacks, fraudulent activity, unsafe requests, and off-platform payment attempts may limit or delay refund processing.",
      ]}
      cta={{ label: "Contact Support", href: "/support" }}
    />
  );
}
