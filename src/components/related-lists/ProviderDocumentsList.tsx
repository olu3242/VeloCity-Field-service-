import { RelatedList } from "./RelatedList";

export function ProviderDocumentsList({ tenantId, providerId }: { tenantId: string; providerId: string }) {
  return <RelatedList title="Provider Documents" table="provider_documents" tenantId={tenantId} filters={[{ column: "provider_id", value: providerId }]} primaryColumn="document_type" statusColumn="status" secondaryColumn="expires_at" />;
}
