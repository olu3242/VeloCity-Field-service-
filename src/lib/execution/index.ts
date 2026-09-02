export * from "./types";
export { execute, getFabricHealthSnapshot } from "./engine";
export type { EngineOptions } from "./engine";
export {
  buildGraph,
  singleNodeGraph,
  executeGraph,
  validateDAG,
  computeGraphStats,
} from "./graph";
export type { NodeExecutor, GraphExecutionOptions, GraphStats } from "./graph";
export { generateExecutionPlan, scorePlanAccuracy } from "./planner";
export type { PlannerOptions } from "./planner";
export { assembleKnowledgeContext, extractRiskHints } from "./knowledge";
export type { KnowledgeRetrievalOptions } from "./knowledge";
export { evaluateSimulationGate, requiresSimulation } from "./digital-twin";
export { recoverGraph, recoverExecution } from "./recovery";
export type { RecoveryOptions, ContextRecoveryResult } from "./recovery";
export {
  createTelemetry,
  recordSpanStart,
  recordSpanEnd,
  recordNodeTelemetry,
  recordDependencyLatency,
  finalizetelemetry,
  generateFlameGraph,
  persistExecutionTrace,
} from "./telemetry";
export {
  publishWEFEvent,
  publishExecutionStarted,
  publishExecutionCompleted,
  publishExecutionFailed,
  publishNodeCompleted,
  publishNodeFailed,
} from "./event-fabric";
export {
  computeExecutionMetrics,
  recordExecutionMetrics,
  aggregateWorkstreamMetrics,
  computeLearningSignals,
  formatSignalsAsHints,
} from "./learning";
