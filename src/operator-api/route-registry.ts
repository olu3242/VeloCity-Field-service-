/**
 * Route Registry — registry of all operator API routes.
 */

import { type ApiAuthScheme } from "./api-contract"

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"

export interface ApiRoute {
  routeId: string
  method: HttpMethod
  path: string
  operation: string
  requiresAuth: boolean
  authSchemes: ApiAuthScheme[]
  tenantScoped: boolean
  description: string
  registeredAt: string
}

const ROUTES: Map<string, ApiRoute> = new Map()

function routeKey(method: HttpMethod, path: string): string {
  return `${method}:${path}`
}

export function registerRoute(
  method: HttpMethod,
  path: string,
  operation: string,
  options?: {
    requiresAuth?: boolean
    authSchemes?: ApiAuthScheme[]
    tenantScoped?: boolean
    description?: string
  }
): ApiRoute {
  const route: ApiRoute = {
    routeId: crypto.randomUUID(),
    method,
    path,
    operation,
    requiresAuth: options?.requiresAuth ?? true,
    authSchemes: options?.authSchemes ?? ["bearer", "api_key"],
    tenantScoped: options?.tenantScoped ?? false,
    description: options?.description ?? "",
    registeredAt: new Date().toISOString(),
  }
  ROUTES.set(routeKey(method, path), route)
  return route
}

export function findRoute(method: HttpMethod, path: string): ApiRoute | undefined {
  return ROUTES.get(routeKey(method, path))
}

export function getRoutesByOperation(operation: string): ApiRoute[] {
  return Array.from(ROUTES.values()).filter((r) => r.operation === operation)
}

export function getRouteReport(): {
  total: number
  byMethod: Record<string, number>
  tenantScoped: number
  public: number
} {
  const all = Array.from(ROUTES.values())
  const byMethod: Record<string, number> = {}
  let tenantScoped = 0
  let publicCount = 0

  for (const r of all) {
    byMethod[r.method] = (byMethod[r.method] ?? 0) + 1
    if (r.tenantScoped) tenantScoped++
    if (!r.requiresAuth) publicCount++
  }

  return { total: all.length, byMethod, tenantScoped, public: publicCount }
}

// Pre-register 10 core operator routes
registerRoute("GET",    "/api/operator/v1/status",               "platform_status",       { description: "Get platform status" })
registerRoute("GET",    "/api/operator/v1/workflows",             "list_workflows",        { tenantScoped: true, description: "List workflows" })
registerRoute("POST",   "/api/operator/v1/workflows",             "start_workflow",        { tenantScoped: true, description: "Start a workflow" })
registerRoute("DELETE", "/api/operator/v1/workflows/:id",         "cancel_workflow",       { tenantScoped: true, description: "Cancel a workflow" })
registerRoute("GET",    "/api/operator/v1/executions",            "list_executions",       { tenantScoped: true, description: "List executions" })
registerRoute("GET",    "/api/operator/v1/telemetry",             "get_telemetry",         { description: "Get telemetry snapshot" })
registerRoute("POST",   "/api/operator/v1/deployments",           "trigger_deployment",    { authSchemes: ["bearer", "signed_request"], description: "Trigger a deployment" })
registerRoute("GET",    "/api/operator/v1/federation",            "get_federation_status", { description: "Get federation status" })
registerRoute("POST",   "/api/operator/v1/governance/pause",      "pause_runtime",         { authSchemes: ["bearer", "signed_request"], description: "Pause the runtime" })
registerRoute("POST",   "/api/operator/v1/governance/resume",     "resume_runtime",        { authSchemes: ["bearer", "signed_request"], description: "Resume the runtime" })
