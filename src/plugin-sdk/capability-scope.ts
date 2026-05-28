/**
 * Capability Scope — defines and enforces plugin capability scopes.
 */

import { type PluginScope, type PluginManifest } from "./plugin-contract"

export interface ScopePolicy {
  scope: PluginScope
  allowedOperations: string[]
  forbiddenOperations: string[]
  requiresTenantSafe: boolean
  maxExecutionMs: number
}

const FORBIDDEN_DEFAULT = ["drop_table", "delete_tenant", "purge_data", "bypass_governance"]

const SCOPE_POLICIES: Map<PluginScope, ScopePolicy> = new Map([
  ["workflow", {
    scope: "workflow",
    allowedOperations: ["start_step", "complete_step", "emit_event"],
    forbiddenOperations: FORBIDDEN_DEFAULT,
    requiresTenantSafe: false,
    maxExecutionMs: 5000,
  }],
  ["telemetry", {
    scope: "telemetry",
    allowedOperations: ["emit_metric", "read_telemetry"],
    forbiddenOperations: FORBIDDEN_DEFAULT,
    requiresTenantSafe: false,
    maxExecutionMs: 2000,
  }],
  ["ai", {
    scope: "ai",
    allowedOperations: ["invoke_model", "score_output"],
    forbiddenOperations: FORBIDDEN_DEFAULT,
    requiresTenantSafe: false,
    maxExecutionMs: 10000,
  }],
  ["governance", {
    scope: "governance",
    allowedOperations: ["check_policy", "emit_audit"],
    forbiddenOperations: FORBIDDEN_DEFAULT,
    requiresTenantSafe: true,
    maxExecutionMs: 1000,
  }],
  ["federation", {
    scope: "federation",
    allowedOperations: ["relay_event", "sync_state"],
    forbiddenOperations: FORBIDDEN_DEFAULT,
    requiresTenantSafe: false,
    maxExecutionMs: 8000,
  }],
  ["observability", {
    scope: "observability",
    allowedOperations: ["add_span", "emit_log"],
    forbiddenOperations: FORBIDDEN_DEFAULT,
    requiresTenantSafe: false,
    maxExecutionMs: 1000,
  }],
  ["queue", {
    scope: "queue",
    allowedOperations: ["enqueue", "dequeue", "requeue"],
    forbiddenOperations: FORBIDDEN_DEFAULT,
    requiresTenantSafe: false,
    maxExecutionMs: 3000,
  }],
])

export function getScopePolicy(scope: PluginScope): ScopePolicy | undefined {
  return SCOPE_POLICIES.get(scope)
}

export function canPerformOperation(scope: PluginScope, operation: string): boolean {
  const policy = SCOPE_POLICIES.get(scope)
  if (!policy) return false
  if (policy.forbiddenOperations.includes(operation)) return false
  return policy.allowedOperations.includes(operation)
}

export function validatePlugin(manifest: PluginManifest): {
  valid: boolean
  violations: string[]
} {
  const violations: string[] = []
  const policy = SCOPE_POLICIES.get(manifest.scope)

  if (!policy) {
    violations.push(`Unknown scope: ${manifest.scope}`)
    return { valid: false, violations }
  }

  if (policy.requiresTenantSafe && !manifest.tenantSafe) {
    violations.push(`Scope '${manifest.scope}' requires tenantSafe: true`)
  }

  if (manifest.hooks.length === 0) {
    violations.push("Plugin must declare at least one lifecycle hook")
  }

  if (!manifest.pluginId || manifest.pluginId.trim() === "") {
    violations.push("Plugin must have a valid pluginId")
  }

  if (!manifest.name || manifest.name.trim() === "") {
    violations.push("Plugin must have a non-empty name")
  }

  return { valid: violations.length === 0, violations }
}
