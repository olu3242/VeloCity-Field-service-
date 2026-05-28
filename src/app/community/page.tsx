import { InfoPage } from "@/components/marketplace";

export default function CommunityPage() {
  return (
    <InfoPage
      eyebrow="// COMMUNITY"
      title="A local services marketplace built around trust."
      description="Community trust is powered by verified providers, customer reviews, completion proof, dispute handling, and quality feedback loops."
      bullets={[
        "Reviews, ratings, provider quality, and completion history remain attached to runtime jobs.",
        "Customers can track service status, quotes, payments, messages, photos, and reviews from dashboard flows.",
        "REX monitors completion signals and quality outcomes to improve future routing.",
      ]}
      cta={{ label: "Explore Services", href: "/services" }}
    />
  );
}
