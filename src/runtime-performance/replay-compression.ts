export interface CompressionRecord {
  recordId: string
  workflowId: string
  tenantId?: string
  originalEventCount: number
  compressedEventCount: number
  compressionRatio: number
  technique: "deduplication" | "delta_encoding" | "snapshot_collapse"
  estimatedSizeSavingKb: number
  compressedAt: string
}

const RECORDS: CompressionRecord[] = []
const CAP = 500

function compressedCount(
  technique: CompressionRecord["technique"],
  originalEvents: number,
): number {
  switch (technique) {
    case "deduplication":    return Math.ceil(originalEvents * 0.7)
    case "delta_encoding":   return Math.ceil(originalEvents * 0.5)
    case "snapshot_collapse": return Math.ceil(originalEvents * 0.3)
  }
}

export function compressReplayLog(
  workflowId: string,
  originalEvents: number,
  technique: CompressionRecord["technique"],
  tenantId?: string,
): CompressionRecord {
  const compressed = compressedCount(technique, originalEvents)
  const compressionRatio = originalEvents / Math.max(1, compressed)
  const estimatedSizeSavingKb = (originalEvents - compressed) * 0.5
  const record: CompressionRecord = {
    recordId: crypto.randomUUID(),
    workflowId,
    tenantId,
    originalEventCount: originalEvents,
    compressedEventCount: compressed,
    compressionRatio,
    technique,
    estimatedSizeSavingKb,
    compressedAt: new Date().toISOString(),
  }
  if (RECORDS.length >= CAP) RECORDS.shift()
  RECORDS.push(record)
  return record
}

export function getCompressionRecord(
  workflowId: string,
): CompressionRecord | undefined {
  return RECORDS.find((r) => r.workflowId === workflowId)
}

export function getCompressionSummary(): {
  total: number
  avgRatio: number
  totalSavingKb: number
  byTechnique: Record<string, number>
} {
  const byTechnique: Record<string, number> = {}
  let totalRatio = 0
  let totalSavingKb = 0
  for (const r of RECORDS) {
    byTechnique[r.technique] = (byTechnique[r.technique] ?? 0) + 1
    totalRatio += r.compressionRatio
    totalSavingKb += r.estimatedSizeSavingKb
  }
  const total = RECORDS.length
  return {
    total,
    avgRatio: total > 0 ? totalRatio / total : 0,
    totalSavingKb,
    byTechnique,
  }
}
