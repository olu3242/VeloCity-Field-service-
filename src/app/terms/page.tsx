import { InfoPage } from "@/components/marketplace";

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="// TERMS"
      title="Terms of Service"
      description="These terms govern customer and provider use of the VeloCity marketplace, including service requests, dispatch, payments, communications, reviews, and operational support."
      bullets={[
        "Customers must provide accurate request, location, scheduling, and payment information and approve quoted work before service begins.",
        "Providers remain responsible for licensing, insurance, workmanship, safety, tools, taxes, and compliance with applicable local requirements.",
        "Marketplace payments, refunds, disputes, payouts, messages, reviews, and support activity are processed through VeloCity's operational systems and audit records.",
      ]}
      cta={{ label: "Return Home", href: "/" }}
    />
  );
}
