export interface FederatedIdentity {
  id: string
  localId: string
  federatedId: string
  nodeId: string
  tenantId: string
  identityType: "user" | "agent" | "tenant" | "service"
  verified: boolean
  createdAt: string
  lastVerifiedAt: string
}

const IDENTITIES: Map<string, FederatedIdentity> = new Map()
const CAP = 2000

export function federateIdentity(
  localId: string,
  federatedId: string,
  nodeId: string,
  tenantId: string,
  identityType: FederatedIdentity["identityType"]
): FederatedIdentity {
  if (IDENTITIES.size >= CAP) {
    const firstKey = Array.from(IDENTITIES.keys())[0]
    if (firstKey !== undefined) IDENTITIES.delete(firstKey)
  }
  const identity: FederatedIdentity = {
    id: crypto.randomUUID(),
    localId,
    federatedId,
    nodeId,
    tenantId,
    identityType,
    verified: false,
    createdAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  }
  IDENTITIES.set(identity.id, identity)
  return identity
}

export function verifyIdentity(id: string): void {
  const identity = IDENTITIES.get(id)
  if (identity) {
    identity.verified = true
    identity.lastVerifiedAt = new Date().toISOString()
  }
}

export function resolveIdentity(federatedId: string): FederatedIdentity | undefined {
  return Array.from(IDENTITIES.values()).find(i => i.federatedId === federatedId)
}

export function getIdentitiesByNode(nodeId: string): FederatedIdentity[] {
  return Array.from(IDENTITIES.values()).filter(i => i.nodeId === nodeId)
}

export function getUnverifiedIdentities(): FederatedIdentity[] {
  return Array.from(IDENTITIES.values()).filter(i => !i.verified)
}
