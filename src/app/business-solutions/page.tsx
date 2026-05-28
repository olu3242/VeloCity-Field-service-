import { InfoPage } from "@/components/marketplace";

export default function BusinessSolutionsPage() {
  return (
    <InfoPage
      eyebrow="// BUSINESS SOLUTIONS"
      title="Field service operations for teams, portfolios, and repeat work."
      description="Business workflows can reuse the same booking, dispatch, quote, provider, payment, and quality infrastructure that powers consumer requests."
      bullets={[
        "Multi-tenant runtime primitives and access controls are present for enterprise growth.",
        "Operational dashboards expose jobs, providers, payments, automation, disputes, and launch readiness.",
        "Reusable workflows support repeat service, SLA monitoring, and escalation handling.",
      ]}
      cta={{ label: "Open Command Center", href: "/admin/dashboard" }}
    />
  );
}
