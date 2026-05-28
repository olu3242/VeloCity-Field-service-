import { logger } from "@/runtime-core/observability"

export interface WorkflowGeneration {
  generationId: string
  workflowType: string
  generation: number
  tenantId?: string
  parentGenerationId?: string
  mutationSummary: string
  fitnessScore: number
  active: boolean
  createdAt: string
  retiredAt?: string
}

const GENERATIONS: Map<string, WorkflowGeneration[]> = new Map()
const MAX_PER_TYPE = 10

export function createGeneration(
  workflowType: string,
  mutationSummary: string,
  fitnessScore: number,
  tenantId?: string,
): WorkflowGeneration {
  const existing = GENERATIONS.get(workflowType) ?? []
  const parentGen = existing.length > 0 ? existing[existing.length - 1] : undefined
  const generation: WorkflowGeneration = {
    generationId: crypto.randomUUID(),
    workflowType,
    generation: existing.length + 1,
    tenantId,
    parentGenerationId: parentGen?.generationId,
    mutationSummary,
    fitnessScore: Math.max(0, Math.min(100, fitnessScore)),
    active: true,
    createdAt: new Date().toISOString(),
  }
  existing.push(generation)
  if (existing.length > MAX_PER_TYPE) existing.shift()
  GENERATIONS.set(workflowType, existing)
  logger.info(`Generation created: ${workflowType} gen ${generation.generation}`, "workflow-evolution", {
    metadata: { generationId: generation.generationId, fitnessScore },
  })
  return generation
}

export function retireGeneration(generationId: string): void {
  for (const gens of Array.from(GENERATIONS.values())) {
    const gen = gens.find(g => g.generationId === generationId)
    if (gen) { gen.active = false; gen.retiredAt = new Date().toISOString(); return }
  }
}

export function getActiveGeneration(workflowType: string): WorkflowGeneration | undefined {
  const gens = GENERATIONS.get(workflowType) ?? []
  return [...gens].reverse().find(g => g.active)
}

export function getGenerationHistory(workflowType: string): WorkflowGeneration[] {
  return GENERATIONS.get(workflowType) ?? []
}

export function getEvolutionSummary(): { totalWorkflowTypes: number; avgGenerations: number; avgFitness: number } {
  const allTypes = Array.from(GENERATIONS.values())
  const totalWorkflowTypes = GENERATIONS.size
  const avgGenerations = totalWorkflowTypes > 0 ? allTypes.reduce((s, g) => s + g.length, 0) / totalWorkflowTypes : 0
  const allGens = allTypes.flat()
  const avgFitness = allGens.length > 0 ? allGens.reduce((s, g) => s + g.fitnessScore, 0) / allGens.length : 0
  return { totalWorkflowTypes, avgGenerations, avgFitness }
}
