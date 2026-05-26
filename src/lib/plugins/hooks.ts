import { getPluginsForHook } from "./registry";

export type HookPoint =
  | "before:agent_execution"
  | "after:agent_execution"
  | "before:event_emitted"
  | "after:event_emitted"
  | "on:circuit_open"
  | "on:circuit_close"
  | "on:runtime_pause"
  | "on:runtime_resume"
  | "on:handler_error"
  | "on:queue_flood"
  | "after:workflow_complete"
  | "before:payout_release"
  | "before:dispute_resolve";

export interface HookContext {
  hookPoint: HookPoint;
  tenantId?: string;
  payload: Record<string, unknown>;
  traceId?: string;
  timestamp: string;
}

export interface HookResult {
  hookPoint: HookPoint;
  pluginsRun: string[];
  errors: Array<{ pluginId: string; error: string }>;
  durationMs: number;
}

const programmaticHandlers = new Map<
  HookPoint,
  Array<(ctx: HookContext) => Promise<void>>
>();

export function registerHookHandler(
  hookPoint: HookPoint,
  handler: (ctx: HookContext) => Promise<void>
): void {
  const existing = programmaticHandlers.get(hookPoint) ?? [];
  existing.push(handler);
  programmaticHandlers.set(hookPoint, existing);
}

export async function executeHook(
  hookPoint: HookPoint,
  context: Omit<HookContext, "hookPoint" | "timestamp"> & {
    hookPoint?: HookPoint;
    timestamp?: string;
  }
): Promise<HookResult> {
  const start = Date.now();
  const ctx: HookContext = {
    ...context,
    hookPoint,
    timestamp: new Date().toISOString(),
  };

  const plugins = getPluginsForHook(hookPoint, context.tenantId);
  const pluginsRun: string[] = [];
  const errors: Array<{ pluginId: string; error: string }> = [];

  for (const plugin of plugins) {
    try {
      console.log("[Hook]", plugin.id, hookPoint);
      pluginsRun.push(plugin.id);
    } catch (err) {
      errors.push({
        pluginId: plugin.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const handlers = programmaticHandlers.get(hookPoint) ?? [];
  for (const handler of handlers) {
    try {
      await handler(ctx);
    } catch (err) {
      errors.push({
        pluginId: "__programmatic__",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    hookPoint,
    pluginsRun,
    errors,
    durationMs: Date.now() - start,
  };
}
