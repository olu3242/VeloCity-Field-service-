export interface OrchestrationContext {
  workflowId: string
  workflowType: string
  tenantId?: string
  rootEventType: string
  correlationId: string
  traceId: string
  stepIndex: number
  totalSteps: number
  parentWorkflowId?: string
  region?: string
  initiatedBy: string      // agent name or "system"
  initiatedAt: string
  deadline?: string        // ISO timestamp — SLA deadline
}

const ACTIVE_CONTEXTS: Map<string, OrchestrationContext> = new Map()
const MAX_CONTEXTS = 1000

export function createOrchestrationContext(
  workflowType: string,
  rootEventType: string,
  initiatedBy: string,
  options?: Partial<Pick<OrchestrationContext, "tenantId" | "parentWorkflowId" | "region" | "totalSteps" | "deadline">>
): OrchestrationContext {
  if (ACTIVE_CONTEXTS.size >= MAX_CONTEXTS) {
    const firstKey = ACTIVE_CONTEXTS.keys().next().value as string
    ACTIVE_CONTEXTS.delete(firstKey)
  }
  const ctx: OrchestrationContext = {
    workflowId: crypto.randomUUID(),
    workflowType,
    rootEventType,
    correlationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    stepIndex: 0,
    totalSteps: options?.totalSteps ?? 1,
    initiatedBy,
    initiatedAt: new Date().toISOString(),
    tenantId: options?.tenantId,
    parentWorkflowId: options?.parentWorkflowId,
    region: options?.region,
    deadline: options?.deadline,
  }
  ACTIVE_CONTEXTS.set(ctx.workflowId, ctx)
  return ctx
}

export function advanceStep(workflowId: string): void {
  const ctx = ACTIVE_CONTEXTS.get(workflowId)
  if (ctx) ctx.stepIndex++
}

export function getOrchestrationContext(workflowId: string): OrchestrationContext | undefined {
  return ACTIVE_CONTEXTS.get(workflowId)
}

export function completeOrchestration(workflowId: string): void {
  ACTIVE_CONTEXTS.delete(workflowId)
}

export function getActiveOrchestrations(tenantId?: string): OrchestrationContext[] {
  const all = Array.from(ACTIVE_CONTEXTS.values())
  return tenantId ? all.filter((c) => c.tenantId === tenantId) : all
}
