import { RelatedList } from "./RelatedList";

export function TenantJobsList({ tenantId }: { tenantId: string }) {
  return <RelatedList title="Tenant Jobs" table="jobs" tenantId={tenantId} primaryColumn="title" statusColumn="status" amountColumn="final_cost_cents" href={(row) => `/admin/jobs/${row.id}`} />;
}
