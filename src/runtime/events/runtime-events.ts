import { runtimeLogger } from "@/runtime/logging/logger";

export type RuntimeEvent = {
  type: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
};

export function emitRuntimeEvent(event: RuntimeEvent) {
  runtimeLogger.info("runtime_event", {
    event_type: event.type,
    correlation_id: event.correlationId,
    payload: event.payload ?? {},
  });
}
