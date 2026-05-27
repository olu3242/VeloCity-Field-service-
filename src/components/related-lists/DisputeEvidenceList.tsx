import { RelatedList } from "./RelatedList";

export function DisputeEvidenceList({ tenantId, disputeId }: { tenantId: string; disputeId: string }) {
  return <RelatedList title="Dispute Evidence" table="dispute_evidence" tenantId={tenantId} filters={[{ column: "dispute_id", value: disputeId }]} primaryColumn="evidence_type" statusColumn="evidence_type" secondaryColumn="description" href={(row) => (row.url ? String(row.url) : null)} />;
}
