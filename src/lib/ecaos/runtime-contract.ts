// ECAOS Unified Runtime Contracts
// Every workstream, autonomous action, and ecosystem interaction emits
// from these canonical event sets. Missing events fail certification.

export const RUNTIME_EVENTS = [
  "Initialized", "Authenticated", "TenantResolved", "RBACValidated",
  "DependenciesLoaded", "ExecutionStarted", "ExecutionCompleted",
  "StatePersisted", "AuditRecorded", "MemoryWritten", "KnowledgeUpdated",
  "PredictionGenerated", "CommercialUpdated", "FinancialUpdated",
  "GovernanceValidated", "OptimizationApplied", "RuntimeCertified", "Completed",
] as const;

export type RuntimeEvent = typeof RUNTIME_EVENTS[number];

export const AUTONOMOUS_EVENTS = [
  "ObservationCaptured", "ContextResolved", "KnowledgeRetrieved",
  "ReasoningCompleted", "SimulationPassed", "RiskCalculated",
  "GovernanceValidated", "DecisionApproved", "ExecutionVerified",
  "OutcomeMeasured", "LearningApplied", "OptimizationCompleted",
  "CertificationUpdated",
] as const;

export type AutonomousEvent = typeof AUTONOMOUS_EVENTS[number];

export const ECOSYSTEM_EVENTS = [
  "SignalDetected", "EnterpriseGraphUpdated", "DigitalTwinUpdated",
  "CrossDomainInsightsPublished", "CouncilReviewCompleted",
  "ImpactMeasured", "KnowledgeIntegrated", "EcosystemHealthUpdated",
] as const;

export type EcosystemEvent = typeof ECOSYSTEM_EVENTS[number];

export const WORKSTREAM_DOMAINS = [
  "customer", "dispatch", "provider", "membership", "franchise",
  "commercial", "billing", "inventory", "ai", "marketplace", "admin", "background",
] as const;

export type WorkstreamDomain = typeof WORKSTREAM_DOMAINS[number];

export const CERTIFICATION_DOMAINS = [
  "runtime_reliability", "customer_success", "provider_excellence",
  "financial_integrity", "commercial_performance", "franchise_operations",
  "security", "compliance", "ai_governance", "operational_efficiency",
  "ecosystem_health",
] as const;

export type CertificationDomain = typeof CERTIFICATION_DOMAINS[number];

// Minimum events required for a workstream to pass certification
export const REQUIRED_RUNTIME_EVENTS: RuntimeEvent[] = [
  "Initialized", "Authenticated", "TenantResolved", "RBACValidated",
  "DependenciesLoaded", "ExecutionStarted", "ExecutionCompleted",
  "StatePersisted", "AuditRecorded", "MemoryWritten", "GovernanceValidated",
  "RuntimeCertified", "Completed",
];
