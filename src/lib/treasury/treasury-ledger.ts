export interface LedgerEntry {
  id: string
  tenantId: string
  entryType: "credit" | "debit" | "hold" | "release" | "commission" | "payout"
  amount: number
  currency: string
  referenceId?: string
  description: string
  balanceAfter: number
  recordedAt: string
}

const LEDGER: LedgerEntry[] = []
const LEDGER_CAP = 10000
const BALANCES: Map<string, number> = new Map()

const CREDIT_TYPES = new Set<LedgerEntry["entryType"]>(["credit", "release"])

export function recordEntry(
  tenantId: string,
  entryType: LedgerEntry["entryType"],
  amount: number,
  description: string,
  currency = "USD",
  referenceId?: string,
): LedgerEntry {
  const current = BALANCES.get(tenantId) ?? 0
  const delta = CREDIT_TYPES.has(entryType) ? amount : -amount
  const balanceAfter = current + delta
  BALANCES.set(tenantId, balanceAfter)

  const entry: LedgerEntry = {
    id: crypto.randomUUID(),
    tenantId,
    entryType,
    amount,
    currency,
    referenceId,
    description,
    balanceAfter,
    recordedAt: new Date().toISOString(),
  }
  LEDGER.push(entry)
  if (LEDGER.length > LEDGER_CAP) LEDGER.splice(0, LEDGER.length - LEDGER_CAP)
  return entry
}

export function getBalance(tenantId: string): number {
  return BALANCES.get(tenantId) ?? 0
}

export function getLedgerHistory(tenantId: string, limit?: number): LedgerEntry[] {
  const filtered = LEDGER.filter((e) => e.tenantId === tenantId)
  return limit !== undefined ? filtered.slice(-limit) : filtered
}

export function getGlobalBalance(): number {
  return Array.from(BALANCES.values()).reduce((s, v) => s + v, 0)
}
