import { InfoPage } from "@/components/marketplace";

export default function ProviderAgreementPage() {
  return (
    <InfoPage
      eyebrow="// PROVIDER"
      title="Provider Agreement"
      description="This agreement defines the operating rules for professionals who apply to receive work through VeloCity."
      bullets={[
        "Providers must keep licenses, insurance, tax information, background checks, service areas, availability, payout details, and customer communications accurate.",
        "Accepted jobs must be completed safely, professionally, and within the agreed scope, schedule, price, documentation, and completion-proof requirements.",
        "VeloCity may review provider quality, response speed, cancellation behavior, dispute history, SLA adherence, and customer feedback to determine marketplace access.",
      ]}
      cta={{ label: "Apply as Provider", href: "/provider/apply" }}
    />
  );
}
