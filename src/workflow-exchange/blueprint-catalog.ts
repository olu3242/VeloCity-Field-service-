import { logger } from "@/runtime-core/observability"

export interface ExecutionBlueprint {
  blueprintId: string
  name: string
  description: string
  workflowType: string
  estimatedSteps: number
  estimatedDurationMs: number
  requiredCapabilities: string[]
  schema: Record<string, unknown>
  tenantId?: string
  authorId: string
  version: string
  usageCount: number
  createdAt: string
}

const BLUEPRINTS: Map<string, ExecutionBlueprint> = new Map()
const BLUEPRINT_CAP = 1000

function seedBlueprint(
  name: string,
  workflowType: string,
  estimatedSteps: number,
  description: string,
  capabilities: string[]
): void {
  const bp: ExecutionBlueprint = {
    blueprintId: crypto.randomUUID(),
    name,
    description,
    workflowType,
    estimatedSteps,
    estimatedDurationMs: estimatedSteps * 5000,
    requiredCapabilities: capabilities,
    schema: { type: workflowType, steps: estimatedSteps },
    authorId: "platform",
    version: "1.0.0",
    usageCount: 0,
    createdAt: new Date().toISOString(),
  }
  BLUEPRINTS.set(bp.blueprintId, bp)
}

seedBlueprint("Standard Approval Flow", "approval_workflow", 4, "Standard multi-step approval process", ["approval", "notification"])
seedBlueprint("Incident Response Pipeline", "incident_response", 6, "Automated incident detection and response", ["alerting", "remediation", "escalation"])
seedBlueprint("Multi-Region Deployment", "deployment", 8, "Deploy across multiple regions with rollback", ["deployment", "health_check", "rollback"])
seedBlueprint("Compliance Audit Trail", "compliance_audit", 5, "Generate full audit trail for compliance checks", ["audit", "reporting", "data_retention"])

export function createBlueprint(
  name: string,
  workflowType: string,
  schema: Record<string, unknown>,
  requiredCapabilities: string[],
  authorId: string,
  options?: Partial<Pick<ExecutionBlueprint, "description" | "estimatedSteps" | "estimatedDurationMs" | "tenantId" | "version">>
): ExecutionBlueprint {
  if (BLUEPRINTS.size >= BLUEPRINT_CAP) {
    const firstKey = Array.from(BLUEPRINTS.keys())[0]
    if (firstKey !== undefined) BLUEPRINTS.delete(firstKey)
  }
  const bp: ExecutionBlueprint = {
    blueprintId: crypto.randomUUID(),
    name,
    description: options?.description ?? "",
    workflowType,
    estimatedSteps: options?.estimatedSteps ?? 1,
    estimatedDurationMs: options?.estimatedDurationMs ?? 5000,
    requiredCapabilities,
    schema,
    tenantId: options?.tenantId,
    authorId,
    version: options?.version ?? "1.0.0",
    usageCount: 0,
    createdAt: new Date().toISOString(),
  }
  BLUEPRINTS.set(bp.blueprintId, bp)
  logger.info(`Blueprint created: ${name}`, "blueprint-catalog", { metadata: { blueprintId: bp.blueprintId } })
  return bp
}

export function useBlueprint(blueprintId: string): ExecutionBlueprint {
  const bp = BLUEPRINTS.get(blueprintId)
  if (!bp) throw new Error(`Blueprint not found: ${blueprintId}`)
  bp.usageCount++
  return { ...bp }
}

export function getBlueprintsByWorkflowType(workflowType: string): ExecutionBlueprint[] {
  return Array.from(BLUEPRINTS.values()).filter((b) => b.workflowType === workflowType)
}

export function searchBlueprints(capability: string): ExecutionBlueprint[] {
  return Array.from(BLUEPRINTS.values()).filter((b) => b.requiredCapabilities.includes(capability))
}

export function getBlueprintSummary(): { total: number; byWorkflowType: Record<string, number>; totalUsage: number } {
  const byWorkflowType: Record<string, number> = {}
  let totalUsage = 0
  for (const bp of Array.from(BLUEPRINTS.values())) {
    byWorkflowType[bp.workflowType] = (byWorkflowType[bp.workflowType] ?? 0) + 1
    totalUsage += bp.usageCount
  }
  return { total: BLUEPRINTS.size, byWorkflowType, totalUsage }
}
