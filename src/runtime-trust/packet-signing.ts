import { logger } from "@/runtime-core/observability"
import { validateIdentity } from "./workload-identity"

export interface SignedPacket<T extends Record<string, unknown> = Record<string, unknown>> {
  packetId: string
  signerIdentityId: string
  payload: T
  signature: string
  signedAt: string
  expiresAt?: string
  verified: boolean
}

const SIGNED_PACKETS: Map<string, SignedPacket> = new Map()
const CAP = 2000

export function signPacket<T extends Record<string, unknown>>(
  payload: T,
  signerIdentityId: string,
  expiresAt?: string,
): SignedPacket<T> {
  const { valid, reason } = validateIdentity(signerIdentityId)
  if (!valid) {
    logger.warn(`signPacket: invalid signer identity: ${reason}`, "packet-signing")
  }
  if (SIGNED_PACKETS.size >= CAP) {
    const firstKey = Array.from(SIGNED_PACKETS.keys())[0]
    if (firstKey) SIGNED_PACKETS.delete(firstKey)
  }
  const packet: SignedPacket<T> = {
    packetId: crypto.randomUUID(),
    signerIdentityId,
    payload,
    signature: `sig-${signerIdentityId}-${Date.now()}`,
    signedAt: new Date().toISOString(),
    expiresAt,
    verified: valid,
  }
  SIGNED_PACKETS.set(packet.packetId, packet as SignedPacket)
  logger.info(`Packet signed: ${packet.packetId}`, "packet-signing")
  return packet
}

export function verifyPacket(packet: SignedPacket): { valid: boolean; reason?: string } {
  if (!packet.signature) return { valid: false, reason: "Missing signature" }
  const identityCheck = validateIdentity(packet.signerIdentityId)
  if (!identityCheck.valid) return { valid: false, reason: `Identity invalid: ${identityCheck.reason}` }
  if (packet.expiresAt && new Date(packet.expiresAt) < new Date()) {
    return { valid: false, reason: "Packet expired" }
  }
  return { valid: true }
}

export function getPacket(packetId: string): SignedPacket | undefined {
  return SIGNED_PACKETS.get(packetId)
}

export function getSigningStats(): {
  total: number; verified: number; failed: number; byIdentity: Record<string, number>
} {
  let verified = 0, failed = 0
  const byIdentity: Record<string, number> = {}
  for (const p of Array.from(SIGNED_PACKETS.values())) {
    if (p.verified) verified++; else failed++
    byIdentity[p.signerIdentityId] = (byIdentity[p.signerIdentityId] ?? 0) + 1
  }
  return { total: SIGNED_PACKETS.size, verified, failed, byIdentity }
}
