/**
 * Tenant workload isolation enforcement.
 */

export interface IsolationConfig {
  tenantId: string;
  maxConcurrentEvents: number;
  maxQueueDepth: number;
  priorityLevel: "standard" | "elevated" | "priority";
  isolatedWorker: boolean;
  resourceNamespace: string;
}

export interface IsolationViolation {
  tenantId: string;
  violationType: "queue_overflow" | "concurrency_exceeded" | "resource_bleed";
  detail: string;
  detectedAt: string;
}

const VIOLATIONS_CAP = 200;

const CONFIGS = new Map<string, IsolationConfig>();
const VIOLATIONS: IsolationViolation[] = [];

function defaultConfig(tenantId: string): IsolationConfig {
  return {
    tenantId,
    maxConcurrentEvents: 10,
    maxQueueDepth: 50,
    priorityLevel: "standard",
    isolatedWorker: false,
    resourceNamespace: `ns-${tenantId}`,
  };
}

export function setIsolationConfig(config: IsolationConfig): void {
  CONFIGS.set(config.tenantId, config);
}

export function getIsolationConfig(tenantId: string): IsolationConfig {
  return CONFIGS.get(tenantId) ?? defaultConfig(tenantId);
}

export function checkIsolationBounds(
  tenantId: string,
  currentConcurrent: number,
  currentQueueDepth: number
): { allowed: boolean; violations: string[] } {
  const config = getIsolationConfig(tenantId);
  const violations: string[] = [];

  if (currentConcurrent > config.maxConcurrentEvents) {
    violations.push(
      `Concurrent events (${currentConcurrent}) exceeds limit (${config.maxConcurrentEvents})`
    );
  }
  if (currentQueueDepth > config.maxQueueDepth) {
    violations.push(
      `Queue depth (${currentQueueDepth}) exceeds limit (${config.maxQueueDepth})`
    );
  }

  return { allowed: violations.length === 0, violations };
}

export function recordViolation(violation: IsolationViolation): void {
  if (VIOLATIONS.length >= VIOLATIONS_CAP) VIOLATIONS.shift();
  VIOLATIONS.push(violation);
}

export function getViolations(tenantId?: string): IsolationViolation[] {
  if (tenantId === undefined) return Array.from(VIOLATIONS);
  return VIOLATIONS.filter((v) => v.tenantId === tenantId);
}
