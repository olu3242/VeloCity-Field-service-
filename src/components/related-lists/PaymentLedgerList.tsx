import { RelatedList } from "./RelatedList";

export function PaymentLedgerList({ tenantId, paymentId }: { tenantId: string; paymentId?: string }) {
  return <RelatedList title="Payment Ledger" table="payment_ledger" tenantId={tenantId} filters={paymentId ? [{ column: "payment_id", value: paymentId }] : []} primaryColumn="entry_type" statusColumn="status" amountColumn="amount" />;
}
