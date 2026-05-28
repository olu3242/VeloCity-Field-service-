import { logger } from "@/runtime-core/observability"

export interface CompatibilityCheck {
  checkId: string
  fromVersion: string
  toVersion: string
  protocolId: string
  compatible: boolean
  breakingChanges: string[]
  migrationPath?: string
  checkedAt: string
}

const CHECKS: CompatibilityCheck[] = []
const MAX_CHECKS = 500

export function checkCompatibility(
  protocolId: string,
  fromVersion: string,
  toVersion: string
): CompatibilityCheck {
  if (CHECKS.length >= MAX_CHECKS) CHECKS.shift()

  const fromMajor = fromVersion.split(".")[0]
  const toMajor = toVersion.split(".")[0]
  const compatible = fromMajor === toMajor

  const check: CompatibilityCheck = {
    checkId: crypto.randomUUID(),
    fromVersion,
    toVersion,
    protocolId,
    compatible,
    breakingChanges: compatible ? [] : ["major_version_change"],
    migrationPath: compatible
      ? undefined
      : `Upgrade ${protocolId} from ${fromVersion} to ${toVersion}`,
    checkedAt: new Date().toISOString(),
  }

  CHECKS.push(check)
  logger.info(
    `Compatibility check: ${protocolId} ${fromVersion}->${toVersion} compatible=${compatible}`,
    "compatibility-engine"
  )
  return check
}

export function isCompatible(
  protocolId: string,
  fromVersion: string,
  toVersion: string
): boolean {
  return checkCompatibility(protocolId, fromVersion, toVersion).compatible
}

export function getCompatibilityHistory(protocolId: string): CompatibilityCheck[] {
  return CHECKS.filter((c) => c.protocolId === protocolId)
}

export function getCompatibilitySummary(): {
  total: number
  compatible: number
  incompatible: number
} {
  return {
    total: CHECKS.length,
    compatible: CHECKS.filter((c) => c.compatible).length,
    incompatible: CHECKS.filter((c) => !c.compatible).length,
  }
}
