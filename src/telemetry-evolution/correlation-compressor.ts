import { logger } from "@/runtime-core/observability"

export interface CompressionJob {
  jobId: string
  correlationId: string
  tenantId?: string
  originalEventCount: number
  compressedEventCount: number
  compressionRatio: number
  technique: "delta" | "deduplication" | "summarization"
  estimatedSavingKb: number
  compressedAt: string
}

const JOBS: CompressionJob[] = []
const MAX_JOBS = 500

function pruneJobs(): void {
  while (JOBS.length >= MAX_JOBS) {
    JOBS.shift()
  }
}

export function compressCorrelation(
  correlationId: string,
  eventCount: number,
  technique: CompressionJob["technique"],
  tenantId?: string
): CompressionJob {
  pruneJobs()

  let compressedEventCount: number
  if (technique === "delta") {
    compressedEventCount = Math.ceil(eventCount * 0.4)
  } else if (technique === "deduplication") {
    compressedEventCount = Math.ceil(eventCount * 0.6)
  } else {
    compressedEventCount = Math.ceil(eventCount * 0.15)
  }

  const compressionRatio = eventCount / Math.max(1, compressedEventCount)
  const estimatedSavingKb = (eventCount - compressedEventCount) * 0.5

  const job: CompressionJob = {
    jobId: crypto.randomUUID(),
    correlationId,
    tenantId,
    originalEventCount: eventCount,
    compressedEventCount,
    compressionRatio,
    technique,
    estimatedSavingKb,
    compressedAt: new Date().toISOString(),
  }

  JOBS.push(job)
  logger.info("Correlation compressed", { correlationId, technique, compressionRatio })
  return job
}

export function getCompressionJob(correlationId: string): CompressionJob | undefined {
  for (let i = JOBS.length - 1; i >= 0; i--) {
    if (JOBS[i]?.correlationId === correlationId) return JOBS[i]
  }
  return undefined
}

export function getCompressionSummary(): {
  total: number
  byTechnique: Record<string, number>
  avgRatio: number
  totalSavedKb: number
} {
  const byTechnique: Record<string, number> = {}
  for (const j of JOBS) {
    byTechnique[j.technique] = (byTechnique[j.technique] ?? 0) + 1
  }
  const avgRatio = JOBS.length > 0 ? JOBS.reduce((s, j) => s + j.compressionRatio, 0) / JOBS.length : 0
  return {
    total: JOBS.length,
    byTechnique,
    avgRatio,
    totalSavedKb: JOBS.reduce((s, j) => s + j.estimatedSavingKb, 0),
  }
}
