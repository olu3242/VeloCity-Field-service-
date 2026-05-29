import { InfoPage } from "@/components/marketplace";

export default function ContractorAgreementPage() {
  return (
    <InfoPage
      eyebrow="// CONTRACTOR"
      title="Independent Contractor Agreement"
      description="Providers using VeloCity operate as independent businesses and are not employees, agents, or joint venturers of VeloCity."
      bullets={[
        "Providers control their tools, methods, pricing inputs, availability, service territories, staffing, expenses, taxes, and legal compliance.",
        "VeloCity supplies marketplace infrastructure, dispatch coordination, payment processing, support workflows, and operational quality controls.",
        "Providers are responsible for required permits, licenses, insurance, worker classification compliance, customer safety, and completed-work warranties they offer.",
      ]}
      cta={{ label: "Provider Agreement", href: "/provider-agreement" }}
    />
  );
}
