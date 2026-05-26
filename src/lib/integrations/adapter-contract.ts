import { isOpen } from "@/lib/governance/circuit-breaker";

export type AdapterStatus = "healthy" | "degraded" | "offline" | "unknown";
export type AdapterType =
  | "payment"
  | "notification"
  | "crm"
  | "erp"
  | "analytics"
  | "ai_provider"
  | "logistics"
  | "communication";

export interface AdapterHealth {
  adapterId: string;
  name: string;
  type: AdapterType;
  status: AdapterStatus;
  lastCheckAt: string;
  successRate: number;
  avgLatencyMs: number;
  consecutiveFailures: number;
  isCircuitOpen: boolean;
}

export interface AdapterEvent {
  adapterId: string;
  direction: "inbound" | "outbound";
  externalEventType: string;
  internalEventType?: string;
  success: boolean;
  latencyMs: number;
  error?: string;
  timestamp: string;
}

export interface AdapterContract {
  adapterId: string;
  name: string;
  type: AdapterType;
  version: string;
  enabled: boolean;
  supportsRetry: boolean;
  supportsWebhook: boolean;
  supportsReplay: boolean;
  maxRetries: number;
  timeoutMs: number;
}

export const ADAPTER_REGISTRY = new Map<string, AdapterContract>();
export const ADAPTER_EVENTS: AdapterEvent[] = [];
export const FAILURE_COUNTS = new Map<string, number>();

export function registerAdapter(contract: AdapterContract): void {
  ADAPTER_REGISTRY.set(contract.adapterId, contract);
}

export function getAdapter(id: string): AdapterContract | null {
  return ADAPTER_REGISTRY.get(id) ?? null;
}

export function recordAdapterEvent(event: AdapterEvent): void {
  if (ADAPTER_EVENTS.length >= 500) {
    ADAPTER_EVENTS.shift();
  }
  ADAPTER_EVENTS.push(event);

  if (!event.success) {
    FAILURE_COUNTS.set(event.adapterId, (FAILURE_COUNTS.get(event.adapterId) ?? 0) + 1);
  } else {
    FAILURE_COUNTS.set(event.adapterId, 0);
  }
}

export function getAdapterHealth(adapterId: string): AdapterHealth {
  const contract = ADAPTER_REGISTRY.get(adapterId);
  const allEvents = ADAPTER_EVENTS.filter((e) => e.adapterId === adapterId);
  const recent = allEvents.slice(-100);
  const total = recent.length;
  const successCount = recent.filter((e) => e.success).length;
  const successRate = total > 0 ? successCount / total : 1;
  const avgLatencyMs =
    total > 0 ? recent.reduce((sum, e) => sum + e.latencyMs, 0) / total : 0;

  let consecutiveFailures = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (!recent[i].success) consecutiveFailures++;
    else break;
  }

  const circuitOpen = isOpen(adapterId);

  let status: AdapterStatus;
  if (circuitOpen) {
    status = "offline";
  } else if (successRate < 0.9) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  return {
    adapterId,
    name: contract?.name ?? adapterId,
    type: contract?.type ?? "analytics",
    status,
    lastCheckAt: new Date().toISOString(),
    successRate,
    avgLatencyMs,
    consecutiveFailures,
    isCircuitOpen: circuitOpen,
  };
}

export function getAllAdapterHealth(): AdapterHealth[] {
  return Array.from(ADAPTER_REGISTRY.keys()).map(getAdapterHealth);
}

// Pre-register built-in adapters
const BUILTIN_ADAPTERS: AdapterContract[] = [
  {
    adapterId: "stripe",
    name: "Stripe",
    type: "payment",
    version: "2024-04",
    enabled: true,
    supportsRetry: true,
    supportsWebhook: true,
    supportsReplay: false,
    maxRetries: 3,
    timeoutMs: 30_000,
  },
  {
    adapterId: "sendgrid",
    name: "SendGrid",
    type: "notification",
    version: "v3",
    enabled: false,
    supportsRetry: true,
    supportsWebhook: false,
    supportsReplay: false,
    maxRetries: 2,
    timeoutMs: 10_000,
  },
  {
    adapterId: "twilio",
    name: "Twilio",
    type: "communication",
    version: "2010-04-01",
    enabled: false,
    supportsRetry: true,
    supportsWebhook: true,
    supportsReplay: false,
    maxRetries: 2,
    timeoutMs: 10_000,
  },
  {
    adapterId: "slack",
    name: "Slack",
    type: "communication",
    version: "1.0",
    enabled: false,
    supportsRetry: true,
    supportsWebhook: true,
    supportsReplay: false,
    maxRetries: 2,
    timeoutMs: 5_000,
  },
];

for (const adapter of BUILTIN_ADAPTERS) {
  registerAdapter(adapter);
}
