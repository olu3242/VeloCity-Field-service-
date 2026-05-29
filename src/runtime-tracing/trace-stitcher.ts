import { logger } from "@/runtime-core/observability"
import type { DistributedSpan } from "./distributed-tracing"

export interface TraceFragment {
  fragmentId: string
  traceId: string
  sourceNodeId: string
  tenantId?: string
  spans: DistributedSpan[]
  receivedAt: string
  stitched: boolean
}

export interface StitchedTrace {
  stitchedId: string
  traceId: string
  fragmentCount: number
  totalSpans: number
  tenantId?: string
  reconstructedAt: string
  complete: boolean
}

const FRAGMENTS: Map<string, TraceFragment[]> = new Map()
const STITCHED: Map<string, StitchedTrace> = new Map()
const MAX_PER_TRACE = 20
const MAX_TOTAL_ENTRIES = 5000
const MAX_STITCHED = 1000

function countTotalFragments(): number {
  let total = 0
  for (const arr of Array.from(FRAGMENTS.values())) {
    total += arr.length
  }
  return total
}

export function submitFragment(
  traceId: string,
  sourceNodeId: string,
  spans: DistributedSpan[],
  tenantId?: string
): TraceFragment {
  if (countTotalFragments() >= MAX_TOTAL_ENTRIES) {
    const firstKey = Array.from(FRAGMENTS.keys())[0]
    if (firstKey !== undefined) FRAGMENTS.delete(firstKey)
  }
  const fragment: TraceFragment = {
    fragmentId: crypto.randomUUID(),
    traceId,
    sourceNodeId,
    tenantId,
    spans,
    receivedAt: new Date().toISOString(),
    stitched: false,
  }
  const existing = FRAGMENTS.get(traceId) ?? []
  if (existing.length < MAX_PER_TRACE) {
    existing.push(fragment)
    FRAGMENTS.set(traceId, existing)
  }
  logger.info(`Fragment submitted for trace: ${traceId}`, "trace-stitcher")
  return fragment
}

export function stitchTrace(traceId: string): StitchedTrace {
  if (STITCHED.size >= MAX_STITCHED) {
    const oldest = Array.from(STITCHED.keys())[0]
    if (oldest !== undefined) STITCHED.delete(oldest)
  }
  const fragments = FRAGMENTS.get(traceId) ?? []
  const seenSpanIds = new Set<string>()
  for (const fragment of fragments) {
    for (const span of fragment.spans) {
      seenSpanIds.add(span.spanId)
    }
    fragment.stitched = true
  }
  const tenantId = fragments[0]?.tenantId
  const stitched: StitchedTrace = {
    stitchedId: crypto.randomUUID(),
    traceId,
    fragmentCount: fragments.length,
    totalSpans: seenSpanIds.size,
    tenantId,
    reconstructedAt: new Date().toISOString(),
    complete: fragments.length >= 1,
  }
  STITCHED.set(traceId, stitched)
  logger.info(`Trace stitched: ${traceId} (${fragments.length} fragments)`, "trace-stitcher")
  return stitched
}

export function getStitchedTrace(traceId: string): StitchedTrace | undefined {
  return STITCHED.get(traceId)
}

export function getStitchingSummary(): {
  totalFragments: number
  stitchedCount: number
  avgFragmentsPerTrace: number
} {
  const totalFragments = countTotalFragments()
  const stitchedCount = STITCHED.size
  const traceCount = FRAGMENTS.size
  return {
    totalFragments,
    stitchedCount,
    avgFragmentsPerTrace: traceCount > 0 ? totalFragments / traceCount : 0,
  }
}
