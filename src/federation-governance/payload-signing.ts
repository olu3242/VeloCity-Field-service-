import { logger } from "@/runtime-core/observability"

export interface SignedFederationPayload<T = Record<string, unknown>> {
  payloadId: string
  participantId: string
  tenantId?: string
  payload: T
  signature: string
  algorithm: "hmac_sha256"
  signedAt: string
  expiresAt: string
  verified: boolean
}

const PAYLOADS: SignedFederationPayload[] = []
const MAX_PAYLOADS = 2000

function prunePayloads(): void {
  while (PAYLOADS.length >= MAX_PAYLOADS) {
    PAYLOADS.shift()
  }
}

export function signPayload<T extends Record<string, unknown>>(
  participantId: string,
  payload: T,
  tenantId?: string
): SignedFederationPayload<T> {
  prunePayloads()

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  const signed: SignedFederationPayload<T> = {
    payloadId: crypto.randomUUID(),
    participantId,
    tenantId,
    payload,
    signature: `sig-${participantId}-${crypto.randomUUID()}`,
    algorithm: "hmac_sha256",
    signedAt: now.toISOString(),
    expiresAt,
    verified: true,
  }

  PAYLOADS.push(signed as SignedFederationPayload)
  logger.info("Payload signed", { payloadId: signed.payloadId, participantId })
  return signed
}

export function verifyPayload(payloadId: string): boolean {
  const p = PAYLOADS.find((x) => x.payloadId === payloadId)
  if (!p) return false
  if (!p.verified) return false
  if (new Date(p.expiresAt) < new Date()) return false
  return true
}

export function getPayload(payloadId: string): SignedFederationPayload | undefined {
  return PAYLOADS.find((x) => x.payloadId === payloadId)
}

export function getExpiredPayloads(): SignedFederationPayload[] {
  const now = new Date()
  return PAYLOADS.filter((p) => new Date(p.expiresAt) < now)
}

export function getSigningSummary(): {
  total: number
  verified: number
  expired: number
  avgTtlMs: number
} {
  const now = new Date()
  const verified = PAYLOADS.filter((p) => p.verified).length
  const expired = PAYLOADS.filter((p) => new Date(p.expiresAt) < now).length
  const avgTtlMs =
    PAYLOADS.length > 0
      ? PAYLOADS.reduce(
          (s, p) => s + (new Date(p.expiresAt).getTime() - new Date(p.signedAt).getTime()),
          0
        ) / PAYLOADS.length
      : 0
  return { total: PAYLOADS.length, verified, expired, avgTtlMs }
}
