/**
 * VeloCity Contracts — Barrel Export
 *
 * Single import point for all shared contract types.
 *
 * Usage:
 *   import type { AutomationEventType, NotificationType, QueueHealth } from "@/lib/contracts";
 *
 * Note: health.ts contains async functions — import it directly where needed:
 *   import { getPlatformHealth } from "@/lib/contracts/health";
 */

export * from "./events";
export * from "./agents";
export * from "./queues";
export * from "./notifications";
export * from "./runtime";
// health.ts: async functions — import directly to avoid unintended server bundle inclusion
