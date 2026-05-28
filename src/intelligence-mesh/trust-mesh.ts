import { logger } from "@/runtime-core/observability"
import type { MeshTier } from "./intelligence-mesh"

export interface MeshPeerTrust {
  peerId: string
  region?: string
  tier: MeshTier
  trustScore: number
  sharedCount: number
  receivedCount: number
  verifiedShares: number
  lastInteractionAt?: string
  status: "trusted" | "probation" | "quarantined"
  joinedAt: string
}

const PEERS: Map<string, MeshPeerTrust> = new Map()
const MAX_PEERS = 500

export function registerPeer(peerId: string, tier: MeshTier, region?: string): MeshPeerTrust {
  if (PEERS.size >= MAX_PEERS && !PEERS.has(peerId)) {
    const firstKey = Array.from(PEERS.keys())[0]
    if (firstKey !== undefined) PEERS.delete(firstKey)
  }

  const existing = PEERS.get(peerId)
  if (existing) return existing

  const peer: MeshPeerTrust = {
    peerId,
    region,
    tier,
    trustScore: 50,
    sharedCount: 0,
    receivedCount: 0,
    verifiedShares: 0,
    status: "probation",
    joinedAt: new Date().toISOString(),
  }

  PEERS.set(peerId, peer)
  logger.info(`Peer registered: ${peerId}`, "trust-mesh", { metadata: { tier, region } })
  return peer
}

export function recordShare(peerId: string): void {
  const peer = PEERS.get(peerId)
  if (peer) {
    peer.sharedCount += 1
    peer.lastInteractionAt = new Date().toISOString()
    updatePeerTrust(peerId)
  }
}

export function recordReceive(peerId: string, verified: boolean): void {
  const peer = PEERS.get(peerId)
  if (peer) {
    peer.receivedCount += 1
    if (verified) peer.verifiedShares += 1
    peer.lastInteractionAt = new Date().toISOString()
    updatePeerTrust(peerId)
  }
}

export function updatePeerTrust(peerId: string): void {
  const peer = PEERS.get(peerId)
  if (!peer) return
  const score = (peer.verifiedShares / Math.max(1, peer.sharedCount)) * 100
  peer.trustScore = Math.round(Math.max(0, Math.min(100, score)))
  peer.status = peer.trustScore >= 70 ? "trusted" : peer.trustScore >= 30 ? "probation" : "quarantined"
  PEERS.set(peerId, peer)
}

export function getTrustedPeers(): MeshPeerTrust[] {
  return Array.from(PEERS.values()).filter((p) => p.status === "trusted")
}

export function getPeerReport(): {
  total: number
  trusted: number
  probation: number
  quarantined: number
  avgTrustScore: number
} {
  const values = Array.from(PEERS.values())
  const total = values.length
  let trusted = 0, probation = 0, quarantined = 0, totalScore = 0
  for (const p of values) {
    if (p.status === "trusted") trusted++
    else if (p.status === "probation") probation++
    else quarantined++
    totalScore += p.trustScore
  }
  return { total, trusted, probation, quarantined, avgTrustScore: total > 0 ? totalScore / total : 0 }
}
