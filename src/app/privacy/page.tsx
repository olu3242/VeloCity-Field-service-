import { InfoPage } from "@/components/marketplace";

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="// PRIVACY"
      title="Privacy Policy"
      description="Operational placeholder for privacy policy content. Replace with reviewed legal copy before production launch."
      bullets={[
        "Customer, provider, job, message, payment, and automation data should remain protected by auth, RLS, and tenant boundaries.",
        "Realtime channels and storage access must be scoped to authorized users and protected operational roles.",
        "AI agent logs should avoid unnecessary sensitive data and support auditability for marketplace decisions.",
      ]}
      cta={{ label: "Return Home", href: "/" }}
    />
  );
}
