import { InfoPage } from "@/components/marketplace";

export default function ProvidersPage() {
  return (
    <InfoPage
      eyebrow="// PROVIDER NETWORK"
      title="Verified local providers routed by trust and availability."
      description="The provider marketplace connects onboarding, verification, online status, offers, ratings, and payout readiness into one operating layer."
      bullets={[
        "Provider records stay connected to profiles, service categories, service radius, trust score, and online status.",
        "Dispatch offers can route through MAX using proximity, skill, urgency, and acceptance windows.",
        "Provider dashboards already expose live job context, earnings surfaces, and operational actions.",
      ]}
      cta={{ label: "Apply as a Provider", href: "/provider/apply" }}
    />
  );
}
