import { InfoPage } from "@/components/marketplace";

export default function SupportPage() {
  return (
    <InfoPage
      eyebrow="// SUPPORT"
      title="Help for customers, providers, and operators."
      description="Support ties into booking status, provider workflow, quote approvals, payment events, disputes, and quality monitoring."
      bullets={[
        "Customers can use job dashboards for messages, photos, quotes, payments, tips, and reviews.",
        "Providers can manage active jobs, quotes, availability, and earnings from connected dashboard routes.",
        "Admins can monitor disputes, automation status, provider health, and runtime operations.",
      ]}
      cta={{ label: "Go to Dashboard", href: "/dashboard" }}
    />
  );
}
