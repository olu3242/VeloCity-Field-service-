/**
 * Plugin Registry — central registry for all installed plugins.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import {
  type PluginManifest,
  type RegisteredPlugin,
  type PluginScope,
  type PluginLifecycleHook,
} from "./plugin-contract"

const PLUGINS: Map<string, RegisteredPlugin> = new Map()

export function registerPlugin(manifest: PluginManifest): RegisteredPlugin {
  if (isRuntimePaused()) {
    throw new Error("Cannot register plugin: runtime is paused")
  }
  const existing = PLUGINS.get(manifest.pluginId)
  if (existing) return existing

  const registered: RegisteredPlugin = {
    manifest,
    registeredAt: new Date().toISOString(),
    status: "active",
    invocationCount: 0,
  }
  PLUGINS.set(manifest.pluginId, registered)
  logger.info(`Plugin registered: ${manifest.name}`, "plugin-registry", {
    metadata: { pluginId: manifest.pluginId, scope: manifest.scope },
  })
  return registered
}

export function disablePlugin(pluginId: string): void {
  const plugin = PLUGINS.get(pluginId)
  if (plugin) plugin.status = "disabled"
}

export function enablePlugin(pluginId: string): void {
  const plugin = PLUGINS.get(pluginId)
  if (plugin && plugin.status !== "error") plugin.status = "active"
}

export function getPlugin(pluginId: string): RegisteredPlugin | undefined {
  return PLUGINS.get(pluginId)
}

export function getPluginsByScope(scope: PluginScope): RegisteredPlugin[] {
  return Array.from(PLUGINS.values()).filter((p) => p.manifest.scope === scope)
}

export function getPluginsByHook(hook: PluginLifecycleHook): RegisteredPlugin[] {
  return Array.from(PLUGINS.values()).filter(
    (p) => p.status === "active" && p.manifest.hooks.includes(hook)
  )
}

export function recordInvocation(pluginId: string): void {
  const plugin = PLUGINS.get(pluginId)
  if (plugin) {
    plugin.invocationCount += 1
    plugin.lastInvokedAt = new Date().toISOString()
  }
}

export function getPluginReport(): {
  total: number
  active: number
  disabled: number
  error: number
  byScope: Record<string, number>
  topInvoked: string[]
} {
  const all = Array.from(PLUGINS.values())
  const byScope: Record<string, number> = {}
  let active = 0, disabled = 0, error = 0

  for (const p of all) {
    if (p.status === "active") active++
    else if (p.status === "disabled") disabled++
    else error++
    byScope[p.manifest.scope] = (byScope[p.manifest.scope] ?? 0) + 1
  }

  const topInvoked = all
    .sort((a, b) => b.invocationCount - a.invocationCount)
    .slice(0, 5)
    .map((p) => p.manifest.pluginId)

  return { total: all.length, active, disabled, error, byScope, topInvoked }
}
