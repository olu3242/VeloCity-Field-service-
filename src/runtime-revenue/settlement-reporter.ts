import { RevenueRecord } from "./revenue-types";

export function generateSettlementReport(records: RevenueRecord[]): {
  totalGross: number;
  totalNet: number;
  totalPayouts: number;
  periodCount: number;
} {
  const totalGross = records.reduce((sum, r) => sum + r.grossRevenueCents, 0);
  const totalNet = records.reduce((sum, r) => sum + r.netRevenueCents, 0);
  const totalPayouts = records.reduce((sum, r) => sum + r.providerPayoutCents, 0);
  const periodCount = new Set(records.map((r) => r.period)).size;
  return { totalGross, totalNet, totalPayouts, periodCount };
}

export function groupByPeriod(records: RevenueRecord[]): Record<string, RevenueRecord[]> {
  return records.reduce<Record<string, RevenueRecord[]>>((acc, record) => {
    if (!acc[record.period]) acc[record.period] = [];
    acc[record.period].push(record);
    return acc;
  }, {});
}
