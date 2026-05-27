/**
 * Governed activation lifecycle for marketplace workflow templates.
 */

import { isRuntimePaused } from "../governance/operator";

export interface ActivationRequest {
  id: string;
  tenantId: string;
  templateId: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected" | "active";
  governanceNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

const ACTIVATIONS: Map<string, ActivationRequest> = new Map();

export function requestActivation(
  tenantId: string,
  templateId: string,
  requestedBy: string,
): ActivationRequest {
  const paused = isRuntimePaused();
  const request: ActivationRequest = {
    id: crypto.randomUUID(),
    tenantId,
    templateId,
    requestedBy,
    status: paused ? "rejected" : "pending",
    governanceNotes: paused ? "Runtime paused" : undefined,
    createdAt: new Date().toISOString(),
    resolvedAt: paused ? new Date().toISOString() : undefined,
  };
  ACTIVATIONS.set(request.id, request);
  return request;
}

export function approveActivation(id: string, notes?: string): void {
  const req = ACTIVATIONS.get(id);
  if (!req) return;
  req.status = "approved";
  req.resolvedAt = new Date().toISOString();
  if (notes) req.governanceNotes = notes;
}

export function rejectActivation(id: string, reason: string): void {
  const req = ACTIVATIONS.get(id);
  if (!req) return;
  req.status = "rejected";
  req.resolvedAt = new Date().toISOString();
  req.governanceNotes = reason;
}

export function activateTemplate(id: string): void {
  const req = ACTIVATIONS.get(id);
  if (!req) return;
  req.status = "active";
}

export function getActiveTemplates(tenantId: string): ActivationRequest[] {
  return Array.from(ACTIVATIONS.values()).filter(
    (r) => r.tenantId === tenantId && r.status === "active",
  );
}
