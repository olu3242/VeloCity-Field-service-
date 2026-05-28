import { NextRequest } from "next/server";

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createCorrelationId(prefix = "vel") {
  return `${prefix}_${randomId()}`;
}

export function getCorrelationIdFromRequest(request: NextRequest, prefix = "req") {
  return request.headers.get("x-correlation-id") ?? createCorrelationId(prefix);
}
