/**
 * Plugin Contract — canonical plugin interface and registration types.
 */

export type PluginScope =
  | "workflow"
  | "telemetry"
  | "ai"
  | "governance"
  | "federation"
  | "observability"
  | "queue"

export type PluginLifecycleHook =
  | "before_workflow_start"
  | "after_workflow_complete"
  | "on_workflow_fail"
  | "before_queue_process"
  | "after_queue_process"
  | "on_execution_timeout"
  | "on_circuit_open"
  | "on_remediation"

export interface PluginManifest {
  pluginId: string
  name: string
  version: string
  scope: PluginScope
  hooks: PluginLifecycleHook[]
  tenantSafe: boolean
  sandboxed: boolean
  author?: string
  description?: string
}

export interface RegisteredPlugin {
  manifest: PluginManifest
  registeredAt: string
  status: "active" | "disabled" | "error"
  errorMessage?: string
  invocationCount: number
  lastInvokedAt?: string
}

export function createPluginManifest(
  name: string,
  scope: PluginScope,
  hooks: PluginLifecycleHook[],
  options?: {
    version?: string
    tenantSafe?: boolean
    sandboxed?: boolean
    author?: string
    description?: string
  }
): PluginManifest {
  return {
    pluginId: crypto.randomUUID(),
    name,
    version: options?.version ?? "1.0.0",
    scope,
    hooks,
    tenantSafe: options?.tenantSafe ?? false,
    sandboxed: options?.sandboxed ?? true,
    author: options?.author,
    description: options?.description,
  }
}
