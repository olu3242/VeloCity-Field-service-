export function generateInvoice(input: { jobId: string; amount: number; lineItems?: unknown[] }) {
  return {
    invoiceNumber: `INV-${input.jobId.slice(0, 8).toUpperCase()}`,
    amount: input.amount,
    lineItems: input.lineItems ?? [],
    dueOnReceipt: true,
  };
}
