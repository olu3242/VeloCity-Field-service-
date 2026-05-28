import { logger } from "@/runtime-core/observability"

export interface CloudApiEndpoint {
  endpointId: string
  path: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  operation: string
  region: string
  requiresAuth: boolean
  tenantScoped: boolean
  rateLimitPerMinute: number
  registeredAt: string
}

const ENDPOINTS: Map<string, CloudApiEndpoint> = new Map()
const ENDPOINTS_CAP = 200

function endpointKey(method: string, path: string): string {
  return `${method}:${path}`
}

export function registerEndpoint(
  path: string,
  method: CloudApiEndpoint["method"],
  operation: string,
  region: string,
  options?: {
    requiresAuth?: boolean
    tenantScoped?: boolean
    rateLimitPerMinute?: number
  },
): CloudApiEndpoint {
  if (ENDPOINTS.size >= ENDPOINTS_CAP) {
    const oldest = Array.from(ENDPOINTS.keys())[0]
    if (oldest) ENDPOINTS.delete(oldest)
  }
  const ep: CloudApiEndpoint = {
    endpointId: crypto.randomUUID(),
    path,
    method,
    operation,
    region,
    requiresAuth: options?.requiresAuth ?? true,
    tenantScoped: options?.tenantScoped ?? false,
    rateLimitPerMinute: options?.rateLimitPerMinute ?? 60,
    registeredAt: new Date().toISOString(),
  }
  ENDPOINTS.set(endpointKey(method, path), ep)
  logger.info("API endpoint registered", "runtime-cloud-api", { metadata: { method, path, operation } })
  return ep
}

export function getEndpoint(method: CloudApiEndpoint["method"], path: string): CloudApiEndpoint | undefined {
  return ENDPOINTS.get(endpointKey(method, path))
}

export function getEndpointsByRegion(region: string): CloudApiEndpoint[] {
  return Array.from(ENDPOINTS.values()).filter((ep) => ep.region === region)
}

export function getApiSurface(): {
  total: number
  byMethod: Record<string, number>
  byRegion: Record<string, number>
} {
  const all = Array.from(ENDPOINTS.values())
  const byMethod: Record<string, number> = {}
  const byRegion: Record<string, number> = {}
  for (const ep of all) {
    byMethod[ep.method] = (byMethod[ep.method] ?? 0) + 1
    byRegion[ep.region] = (byRegion[ep.region] ?? 0) + 1
  }
  return { total: all.length, byMethod, byRegion }
}

// Seed 8 core endpoints on module load
registerEndpoint("/cloud/v1/status",         "GET",  "cloud_status",          "global", { requiresAuth: false })
registerEndpoint("/cloud/v1/regions",        "GET",  "list_regions",          "global", { requiresAuth: false })
registerEndpoint("/cloud/v1/executions",     "POST", "start_execution",       "global", { tenantScoped: true })
registerEndpoint("/cloud/v1/executions",     "GET",  "list_executions",       "global", { tenantScoped: true })
registerEndpoint("/cloud/v1/orchestrations", "POST", "start_orchestration",   "global", { tenantScoped: true })
registerEndpoint("/cloud/v1/federation",     "GET",  "federation_status",     "global", { requiresAuth: false })
registerEndpoint("/cloud/v1/control",        "POST", "control_plane_command", "global", { requiresAuth: true, rateLimitPerMinute: 10 })
registerEndpoint("/cloud/v1/telemetry",      "GET",  "cloud_telemetry",       "global", { tenantScoped: true })
