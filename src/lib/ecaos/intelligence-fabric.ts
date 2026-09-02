// Intelligence Fabric — shared backbone connecting every platform service.
// Each service registers itself, records reads/writes, and contributes to fabric health.

export type ServiceType =
  | "memory" | "knowledge_graph" | "digital_twin" | "embeddings"
  | "vector_search" | "decision_history" | "telemetry" | "financial_ledger"
  | "audit_ledger" | "event_bus" | "workflow_state" | "ai_context" | "policy_engine";

export type ServiceStatus = "online" | "degraded" | "offline";

export interface FabricService {
  name: string;
  serviceType: ServiceType;
  status: ServiceStatus;
  lastPulseAt: string;
  reads: number;
  writes: number;
  errorCount: number;
  registeredAt: string;
}

export interface FabricInteraction {
  fromService: string;
  toService: string;
  operation: "read" | "write" | "event";
  recordedAt: string;
}

const SERVICES = new Map<string, FabricService>();
const INTERACTIONS: FabricInteraction[] = [];
const INTERACTION_CAP = 1000;

const CORE_SERVICES: Omit<FabricService, "lastPulseAt" | "reads" | "writes" | "errorCount" | "registeredAt">[] = [
  { name: "enterprise-memory",    serviceType: "memory",          status: "online" },
  { name: "knowledge-graph",      serviceType: "knowledge_graph", status: "online" },
  { name: "digital-twin",         serviceType: "digital_twin",    status: "online" },
  { name: "decision-history",     serviceType: "decision_history",status: "online" },
  { name: "ops-telemetry",        serviceType: "telemetry",       status: "online" },
  { name: "financial-ledger",     serviceType: "financial_ledger",status: "online" },
  { name: "audit-ledger",         serviceType: "audit_ledger",    status: "online" },
  { name: "event-bus",            serviceType: "event_bus",       status: "online" },
  { name: "workflow-state",       serviceType: "workflow_state",  status: "online" },
  { name: "ai-context",           serviceType: "ai_context",      status: "online" },
  { name: "policy-engine",        serviceType: "policy_engine",   status: "online" },
];

export function initFabric(): void {
  if (SERVICES.size > 0) return;
  const now = new Date().toISOString();
  for (const svc of CORE_SERVICES) {
    SERVICES.set(svc.name, { ...svc, lastPulseAt: now, reads: 0, writes: 0, errorCount: 0, registeredAt: now });
  }
}
initFabric();

export function registerFabricService(name: string, serviceType: ServiceType): FabricService {
  const now = new Date().toISOString();
  const existing = SERVICES.get(name);
  if (existing) {
    existing.lastPulseAt = now;
    existing.status = "online";
    return existing;
  }
  const svc: FabricService = { name, serviceType, status: "online", lastPulseAt: now, reads: 0, writes: 0, errorCount: 0, registeredAt: now };
  SERVICES.set(name, svc);
  return svc;
}

export function pulseService(name: string): void {
  const svc = SERVICES.get(name);
  if (!svc) return;
  svc.lastPulseAt = new Date().toISOString();
  if (svc.status === "offline") svc.status = "degraded";
}

export function recordFabricRead(fromService: string, toService: string): void {
  const svc = SERVICES.get(toService);
  if (svc) svc.reads++;
  if (INTERACTIONS.length >= INTERACTION_CAP) INTERACTIONS.shift();
  INTERACTIONS.push({ fromService, toService, operation: "read", recordedAt: new Date().toISOString() });
}

export function recordFabricWrite(fromService: string, toService: string): void {
  const svc = SERVICES.get(toService);
  if (svc) svc.writes++;
  if (INTERACTIONS.length >= INTERACTION_CAP) INTERACTIONS.shift();
  INTERACTIONS.push({ fromService, toService, operation: "write", recordedAt: new Date().toISOString() });
}

export function recordFabricError(serviceName: string): void {
  const svc = SERVICES.get(serviceName);
  if (!svc) return;
  svc.errorCount++;
  if (svc.errorCount > 10) svc.status = "degraded";
}

export function getFabricHealth() {
  const services = Array.from(SERVICES.values());
  const online = services.filter(s => s.status === "online").length;
  const degraded = services.filter(s => s.status === "degraded").length;
  const offline = services.filter(s => s.status === "offline").length;
  const health = offline > 2 ? "critical" : degraded > 3 ? "degraded" : "healthy";
  return { services, online, degraded, offline, health, totalReads: services.reduce((s, sv) => s + sv.reads, 0), totalWrites: services.reduce((s, sv) => s + sv.writes, 0) };
}

export function getFabricInteractions(limit = 50): FabricInteraction[] {
  return [...INTERACTIONS].reverse().slice(0, limit);
}

export function getFabricStats() {
  const services = Array.from(SERVICES.values());
  return {
    serviceCount: services.length,
    totalReads: services.reduce((s, sv) => s + sv.reads, 0),
    totalWrites: services.reduce((s, sv) => s + sv.writes, 0),
    totalErrors: services.reduce((s, sv) => s + sv.errorCount, 0),
    recentInteractionCount: INTERACTIONS.length,
  };
}
