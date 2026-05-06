import { RelatedList } from "./RelatedList";

export function ProviderJobsList({ tenantId, providerId }: { tenantId: string; providerId: string }) {
  return <RelatedList title="Provider Jobs" table="jobs" tenantId={tenantId} filters={[{ column: "provider_id", value: providerId }]} primaryColumn="title" statusColumn="status" amountColumn="final_cost_cents" href={(row) => `/admin/jobs/${row.id}`} />;
}
