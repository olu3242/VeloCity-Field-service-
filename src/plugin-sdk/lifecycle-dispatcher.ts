/**
 * Lifecycle Dispatcher — dispatches plugin hooks with error isolation.
 */

import { logger } from "@/runtime-core/observability"
import { type PluginLifecycleHook } from "./plugin-contract"
import { getPluginsByHook, recordInvocation } from "./plugin-registry"

export interface HookDispatchResult {
  dispatchId: string
  hook: PluginLifecycleHook
  pluginId: string
  success: boolean
  durationMs: number
  error?: string
  dispatchedAt: string
}

export type HookHandlerFn = (context: Record<string, unknown>) => Promise<void>

const HANDLERS: Map<string, Map<PluginLifecycleHook, HookHandlerFn>> = new Map()
const DISPATCH_LOG: HookDispatchResult[] = []
const DISPATCH_LOG_CAP = 1000

export function registerHookHandler(
  pluginId: string,
  hook: PluginLifecycleHook,
  handler: HookHandlerFn
): void {
  if (!HANDLERS.has(pluginId)) HANDLERS.set(pluginId, new Map())
  HANDLERS.get(pluginId)!.set(hook, handler)
}

export async function dispatchHook(
  hook: PluginLifecycleHook,
  context: Record<string, unknown>
): Promise<HookDispatchResult[]> {
  const plugins = getPluginsByHook(hook)
  const results: HookDispatchResult[] = []

  for (const plugin of plugins) {
    const pluginId = plugin.manifest.pluginId
    const handler = HANDLERS.get(pluginId)?.get(hook)
    const dispatchedAt = new Date().toISOString()
    const start = Date.now()

    if (!handler) continue

    let success = false
    let errorMsg: string | undefined

    try {
      await handler(context)
      success = true
      recordInvocation(pluginId)
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err)
      logger.error(`Hook dispatch failed: ${hook} on ${pluginId}`, "lifecycle-dispatcher", {
        metadata: { pluginId, hook, error: errorMsg },
      })
    }

    const result: HookDispatchResult = {
      dispatchId: crypto.randomUUID(),
      hook,
      pluginId,
      success,
      durationMs: Date.now() - start,
      error: errorMsg,
      dispatchedAt,
    }

    if (DISPATCH_LOG.length >= DISPATCH_LOG_CAP) DISPATCH_LOG.shift()
    DISPATCH_LOG.push(result)
    results.push(result)
  }

  return results
}

export function getDispatchLog(
  hook?: PluginLifecycleHook,
  pluginId?: string
): HookDispatchResult[] {
  return DISPATCH_LOG.filter(
    (r) =>
      (hook === undefined || r.hook === hook) &&
      (pluginId === undefined || r.pluginId === pluginId)
  )
}

export function getDispatchStats(): {
  total: number
  successful: number
  failed: number
  byHook: Record<string, number>
} {
  const byHook: Record<string, number> = {}
  let successful = 0, failed = 0

  for (const r of DISPATCH_LOG) {
    if (r.success) successful++
    else failed++
    byHook[r.hook] = (byHook[r.hook] ?? 0) + 1
  }

  return { total: DISPATCH_LOG.length, successful, failed, byHook }
}
