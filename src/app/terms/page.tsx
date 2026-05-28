import { InfoPage } from "@/components/marketplace";

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="// TERMS"
      title="Terms of Service"
      description="Operational placeholder for marketplace terms. Replace with reviewed legal copy before production launch."
      bullets={[
        "Customers request local services through VeloCity and agree to job, quote, payment, and review workflows.",
        "Providers are responsible for licensing, insurance, service quality, and safe completion of accepted jobs.",
        "Marketplace payments, refunds, disputes, and payouts must follow the configured Stripe and Supabase policies.",
      ]}
      cta={{ label: "Return Home", href: "/" }}
    />
  );
}
