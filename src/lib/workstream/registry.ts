// Canonical registry of all platform workstreams and their platform dependencies.
// Every workstream declares: dependencies, required permissions, SLA target,
// business category, and whether it is critical to platform operation.
// This registry drives the health matrix, dependency graph, and release gate.

import type { WorkstreamDefinition, PlatformDependencyDefinition } from "./types";

export const PLATFORM_DEPENDENCIES: Record<string, PlatformDependencyDefinition> = {
  database: {
    name: "database",
    displayName: "Supabase Postgres",
    category: "database",
    critical: true,
  },
  redis: {
    name: "redis",
    displayName: "Redis (Upstash)",
    category: "cache",
    critical: false,
  },
  ai: {
    name: "ai",
    displayName: "Anthropic AI",
    category: "ai",
    critical: false,
  },
  stripe: {
    name: "stripe",
    displayName: "Stripe Payments",
    category: "payment",
    critical: false,
  },
  "automation-queue": {
    name: "automation-queue",
    displayName: "Automation Queue",
    category: "queue",
    critical: true,
  },
  "provider-registry": {
    name: "provider-registry",
    displayName: "Provider Registry",
    category: "database",
    critical: true,
  },
  "job-fsm": {
    name: "job-fsm",
    displayName: "Job Lifecycle FSM",
    category: "database",
    critical: true,
  },
  "notification-engine": {
    name: "notification-engine",
    displayName: "Notification Engine",
    category: "queue",
    critical: false,
  },
  "knowledge-graph": {
    name: "knowledge-graph",
    displayName: "Knowledge Graph",
    category: "ai",
    critical: false,
  },
  "digital-twin": {
    name: "digital-twin",
    displayName: "Digital Twin",
    category: "ai",
    critical: false,
  },
  "membership-engine": {
    name: "membership-engine",
    displayName: "Membership Engine",
    category: "database",
    critical: false,
  },
  "franchise-engine": {
    name: "franchise-engine",
    displayName: "Franchise Engine",
    category: "database",
    critical: false,
  },
  "geo-service": {
    name: "geo-service",
    displayName: "Territory Engine",
    category: "external",
    critical: false,
  },
};

export const WORKSTREAM_REGISTRY: WorkstreamDefinition[] = [
  {
    id: "dispatch",
    name: "Dispatch",
    description: "Job dispatch, provider matching, offer routing, and assignment",
    dependencies: ["database", "provider-registry", "job-fsm", "notification-engine", "geo-service"],
    permissions: ["jobs.dispatch", "jobs.assign"],
    slaMs: 2000,
    category: "dispatch",
    critical: true,
  },
  {
    id: "job-lifecycle",
    name: "Job Lifecycle",
    description: "Job creation, FSM state transitions, SLA tracking, and completion",
    dependencies: ["database", "job-fsm", "automation-queue", "notification-engine"],
    permissions: ["jobs.read", "jobs.write"],
    slaMs: 1500,
    category: "dispatch",
    critical: true,
  },
  {
    id: "provider-matching",
    name: "Provider Matching",
    description: "AI-powered provider scoring, matching algorithms, and trust scoring",
    dependencies: ["database", "provider-registry", "ai", "geo-service", "redis"],
    permissions: ["providers.match"],
    slaMs: 3000,
    category: "dispatch",
    critical: true,
  },
  {
    id: "payments",
    name: "Payments",
    description: "Stripe payment intents, webhooks, payouts, refunds, and reconciliation",
    dependencies: ["database", "stripe", "automation-queue"],
    permissions: ["payments.write", "payments.read"],
    slaMs: 5000,
    category: "payments",
    critical: true,
  },
  {
    id: "membership",
    name: "Membership",
    description: "Membership plan management, usage tracking, and entitlement enforcement",
    dependencies: ["database", "membership-engine", "stripe"],
    permissions: ["memberships.read"],
    slaMs: 1000,
    category: "customer",
    critical: false,
  },
  {
    id: "commercial",
    name: "Commercial Accounts",
    description: "Commercial account management, bulk billing, and contract operations",
    dependencies: ["database", "stripe", "automation-queue"],
    permissions: ["commercial.read", "commercial.write"],
    slaMs: 2000,
    category: "customer",
    critical: false,
  },
  {
    id: "provider-lifecycle",
    name: "Provider Lifecycle",
    description: "Provider onboarding, verification, skills management, and trust scoring",
    dependencies: ["database", "provider-registry", "automation-queue", "notification-engine"],
    permissions: ["providers.read", "providers.write"],
    slaMs: 2000,
    category: "provider",
    critical: true,
  },
  {
    id: "customer-experience",
    name: "Customer Experience",
    description: "Booking flow, job tracking, reviews, disputes, and customer notifications",
    dependencies: ["database", "job-fsm", "notification-engine"],
    permissions: ["jobs.read"],
    slaMs: 1500,
    category: "customer",
    critical: true,
  },
  {
    id: "franchise-operations",
    name: "Franchise Operations",
    description: "Territory management, franchise onboarding, royalties, and compliance",
    dependencies: ["database", "franchise-engine", "automation-queue", "stripe"],
    permissions: ["franchise.read", "franchise.write"],
    slaMs: 3000,
    category: "franchise",
    critical: false,
  },
  {
    id: "ai-orchestration",
    name: "AI Orchestration",
    description: "Alice, Nova, IVY, and all AI agent coordination and reasoning",
    dependencies: ["database", "ai", "knowledge-graph", "redis"],
    permissions: ["ai.access"],
    slaMs: 10000,
    category: "ai",
    critical: false,
  },
  {
    id: "automation-engine",
    name: "Automation Engine",
    description: "Event queue processing, workflow execution, and automation rules",
    dependencies: ["database", "automation-queue", "notification-engine"],
    permissions: ["automation.read"],
    slaMs: 5000,
    category: "automation",
    critical: true,
  },
  {
    id: "knowledge-graph",
    name: "Knowledge Graph",
    description: "Entity relationship mapping, contextual memory, and pattern recognition",
    dependencies: ["database", "ai", "redis"],
    permissions: ["intelligence.read"],
    slaMs: 5000,
    category: "intelligence",
    critical: false,
  },
  {
    id: "digital-twin",
    name: "Digital Twin",
    description: "Platform state replica, predictive modeling, and simulation",
    dependencies: ["database", "ai", "knowledge-graph"],
    permissions: ["intelligence.read"],
    slaMs: 8000,
    category: "intelligence",
    critical: false,
  },
  {
    id: "executive-intelligence",
    name: "Executive Intelligence",
    description: "Analytics, forecasting, executive reporting, and strategic intelligence",
    dependencies: ["database", "ai", "knowledge-graph", "digital-twin"],
    permissions: ["analytics.read", "intelligence.read"],
    slaMs: 10000,
    category: "intelligence",
    critical: false,
  },
];

export function getWorkstream(id: string): WorkstreamDefinition | undefined {
  return WORKSTREAM_REGISTRY.find((w) => w.id === id);
}

export function getCriticalWorkstreams(): WorkstreamDefinition[] {
  return WORKSTREAM_REGISTRY.filter((w) => w.critical);
}

export function getWorkstreamsByCategory(
  category: WorkstreamDefinition["category"]
): WorkstreamDefinition[] {
  return WORKSTREAM_REGISTRY.filter((w) => w.category === category);
}
