import { RelatedList } from "./RelatedList";

export function ProviderPayoutsList({ tenantId, providerId }: { tenantId: string; providerId: string }) {
  return <RelatedList title="Provider Payouts" table="payout_ledger" tenantId={tenantId} filters={[{ column: "provider_id", value: providerId }]} primaryColumn="status" statusColumn="status" amountColumn="amount" />;
}
