/**
 * Protocol Versioning — manages protocol version negotiation and compatibility.
 */

import { logger } from "@/runtime-core/observability"

export interface ProtocolVersion {
  version: string
  status: "current" | "supported" | "deprecated" | "unsupported"
  releasedAt: string
  deprecatedAt?: string
  features: string[]
}

const SUPPORTED_VERSIONS: ProtocolVersion[] = []

// Register versions on module load
SUPPORTED_VERSIONS.push({
  version: "1.0.0",
  status: "current",
  releasedAt: "2024-01-01T00:00:00.000Z",
  features: ["workflow_start", "checkpoint", "handoff", "heartbeat"],
})

export function isCompatible(version: string): boolean {
  const found = SUPPORTED_VERSIONS.find((v) => v.version === version)
  return found !== undefined && found.status !== "unsupported"
}

export function negotiate(clientVersion: string): {
  compatible: boolean
  useVersion: string
  warnings: string[]
} {
  const current = getCurrentVersion()
  const warnings: string[] = []
  const found = SUPPORTED_VERSIONS.find((v) => v.version === clientVersion)

  if (!found || found.status === "unsupported") {
    logger.warn(`Protocol version unsupported: ${clientVersion}`, "protocol-versioning")
    return { compatible: false, useVersion: current, warnings: [`version ${clientVersion} is not supported`] }
  }

  if (found.status === "deprecated") {
    warnings.push(`version ${clientVersion} is deprecated; please upgrade to ${current}`)
    logger.warn(`Deprecated protocol version: ${clientVersion}`, "protocol-versioning")
  }

  if (clientVersion !== current) {
    warnings.push(`using ${current} instead of requested ${clientVersion}`)
  }

  return { compatible: true, useVersion: current, warnings }
}

export function getCurrentVersion(): string {
  const current = SUPPORTED_VERSIONS.find((v) => v.status === "current")
  return current?.version ?? "1.0.0"
}

export function getVersionReport(): {
  current: string
  supported: string[]
  deprecated: string[]
} {
  return {
    current: getCurrentVersion(),
    supported: SUPPORTED_VERSIONS
      .filter((v) => v.status === "supported" || v.status === "current")
      .map((v) => v.version),
    deprecated: SUPPORTED_VERSIONS
      .filter((v) => v.status === "deprecated")
      .map((v) => v.version),
  }
}
