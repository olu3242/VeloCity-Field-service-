import { InfoPage } from "@/components/marketplace";

export default function CookiePolicyPage() {
  return (
    <InfoPage
      eyebrow="// COOKIES"
      title="Cookie Policy"
      description="VeloCity uses cookies and similar storage to keep sessions secure, remember preferences, measure reliability, and improve marketplace workflows."
      bullets={[
        "Essential cookies support authentication, security, session persistence, fraud prevention, routing, and form continuity.",
        "Preference and analytics signals may support theme settings, performance monitoring, operational diagnostics, and product reliability measurement.",
        "Users can manage browser cookie settings, but disabling essential storage may prevent login, booking, provider workflows, and dashboard access from working correctly.",
      ]}
      cta={{ label: "Privacy Policy", href: "/privacy" }}
    />
  );
}
