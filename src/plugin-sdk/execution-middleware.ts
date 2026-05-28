/**
 * Execution Middleware — middleware chain for plugin-augmented workflow execution.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { type PluginLifecycleHook } from "./plugin-contract"

export type MiddlewareFn = (
  context: Record<string, unknown>,
  next: () => Promise<void>
) => Promise<void>

export interface MiddlewareRegistration {
  middlewareId: string
  pluginId: string
  hook: PluginLifecycleHook
  priority: number
  fn: MiddlewareFn
  registeredAt: string
}

let MIDDLEWARE_CHAIN: MiddlewareRegistration[] = []

export function registerMiddleware(
  pluginId: string,
  hook: PluginLifecycleHook,
  fn: MiddlewareFn,
  priority = 100
): MiddlewareRegistration {
  const reg: MiddlewareRegistration = {
    middlewareId: crypto.randomUUID(),
    pluginId,
    hook,
    priority,
    fn,
    registeredAt: new Date().toISOString(),
  }
  MIDDLEWARE_CHAIN.push(reg)
  MIDDLEWARE_CHAIN.sort((a, b) => a.priority - b.priority)
  logger.debug(`Middleware registered for hook: ${hook}`, "execution-middleware", {
    metadata: { middlewareId: reg.middlewareId, pluginId, priority },
  })
  return reg
}

export function removeMiddleware(middlewareId: string): void {
  MIDDLEWARE_CHAIN = MIDDLEWARE_CHAIN.filter((m) => m.middlewareId !== middlewareId)
}

export async function executeChain(
  hook: PluginLifecycleHook,
  context: Record<string, unknown>
): Promise<void> {
  if (isRuntimePaused()) {
    logger.warn(`Middleware chain skipped: runtime paused (hook: ${hook})`, "execution-middleware")
    return
  }

  const chain = MIDDLEWARE_CHAIN.filter((m) => m.hook === hook)

  const execute = async (index: number): Promise<void> => {
    if (index >= chain.length) return
    const current = chain[index]
    if (!current) return
    await current.fn(context, () => execute(index + 1))
  }

  await execute(0)
}

export function getMiddlewareForHook(hook: PluginLifecycleHook): MiddlewareRegistration[] {
  return MIDDLEWARE_CHAIN.filter((m) => m.hook === hook)
}

export function getMiddlewareCount(): number {
  return MIDDLEWARE_CHAIN.length
}
