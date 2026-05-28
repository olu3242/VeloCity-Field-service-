import { InfoPage } from "@/components/marketplace";

export default function TerritoryOperatorsPage() {
  return (
    <InfoPage
      eyebrow="// TERRITORY OPERATORS"
      title="Operate local markets with AI dispatch control."
      description="Territory operators need provider density, service-area coverage, automation health, trust monitoring, and marketplace economics in one command layer."
      bullets={[
        "Service-area validation and provider service radius data create the foundation for territory coverage.",
        "Admin surfaces already expose operational modules for jobs, growth, disputes, payouts, pricing, and automation.",
        "Expansion intelligence modules can score supply gaps, city readiness, and territory health.",
      ]}
      cta={{ label: "View Admin Ops", href: "/admin/dashboard" }}
    />
  );
}
