import { InfoPage } from "@/components/marketplace";

export default function ServiceAreasPage() {
  return (
    <InfoPage
      eyebrow="// SERVICE AREAS"
      title="ZIP-aware local coverage before every booking."
      description="VeloCity validates serviceability before jobs are persisted, keeping marketplace supply honest and preventing broken dispatch promises."
      bullets={[
        "Booking creation checks active service-area coverage before emitting automation events.",
        "Provider routing can combine ZIP coverage, radius, live availability, and SLA urgency.",
        "Territory expansion can be measured against demand, provider density, and operational readiness.",
      ]}
      cta={{ label: "Check a Service", href: "/book" }}
    />
  );
}
