/**
 * Tenant-level automation controls.
 */

export interface TenantAutomationControl {
  tenantId: string;
  disabledEventTypes: string[];
  pausedUntil?: string;
  customRetryPolicy?: { maxRetries: number; baseDelayMs: number };
  aiEnabled: boolean;
  reason?: string;
  updatedAt: string;
}

const CONTROLS = new Map<string, TenantAutomationControl>();

function defaultControl(tenantId: string): TenantAutomationControl {
  return {
    tenantId,
    disabledEventTypes: [],
    aiEnabled: true,
    updatedAt: new Date().toISOString(),
  };
}

export function getControl(tenantId: string): TenantAutomationControl {
  return CONTROLS.get(tenantId) ?? defaultControl(tenantId);
}

export function setControl(control: TenantAutomationControl): void {
  CONTROLS.set(control.tenantId, control);
}

export function disableEventType(
  tenantId: string,
  eventType: string,
  reason?: string
): void {
  const control = getControl(tenantId);
  if (!control.disabledEventTypes.includes(eventType)) {
    control.disabledEventTypes.push(eventType);
  }
  if (reason !== undefined) control.reason = reason;
  control.updatedAt = new Date().toISOString();
  CONTROLS.set(tenantId, control);
}

export function enableEventType(tenantId: string, eventType: string): void {
  const control = getControl(tenantId);
  control.disabledEventTypes = control.disabledEventTypes.filter(
    (et) => et !== eventType
  );
  control.updatedAt = new Date().toISOString();
  CONTROLS.set(tenantId, control);
}

export function pauseTenantAutomation(
  tenantId: string,
  durationMs: number,
  reason: string
): void {
  const control = getControl(tenantId);
  control.pausedUntil = new Date(Date.now() + durationMs).toISOString();
  control.reason = reason;
  control.updatedAt = new Date().toISOString();
  CONTROLS.set(tenantId, control);
}

export function isEventAllowed(tenantId: string, eventType: string): boolean {
  const control = getControl(tenantId);
  if (control.pausedUntil !== undefined) {
    const pausedUntilMs = new Date(control.pausedUntil).getTime();
    if (Date.now() < pausedUntilMs) return false;
  }
  return !control.disabledEventTypes.includes(eventType);
}
