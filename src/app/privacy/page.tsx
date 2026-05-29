import { InfoPage } from "@/components/marketplace";

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="// PRIVACY"
      title="Privacy Policy"
      description="This policy explains how VeloCity collects, uses, protects, and audits marketplace data for customers, providers, enterprise accounts, and operational administrators."
      bullets={[
        "We process account, contact, job, location, payment, message, review, support, device, and operational telemetry data to run the marketplace and protect service quality.",
        "Access controls, tenant boundaries, row-level security, signed storage access, and service-role restrictions are used to limit data access to authorized workflows.",
        "Automation and AI logs are retained for operational auditability, quality review, abuse prevention, dispute handling, and service reliability monitoring.",
      ]}
      cta={{ label: "Return Home", href: "/" }}
    />
  );
}
