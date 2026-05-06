import { checkFieldPermission } from "./checkFieldPermission";
import type { PermissionObject } from "./types";

function maskValue(value: unknown) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (text.length <= 4) return "****";
  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

export async function maskFields<T extends Record<string, unknown>>(input: {
  userId: string;
  tenantId: string;
  object: PermissionObject;
  record: T;
}): Promise<T> {
  const masked = { ...input.record };
  for (const field of Object.keys(masked)) {
    const hidden = await checkFieldPermission({ ...input, field, operation: "hidden" });
    if (hidden.allowed) delete masked[field];
    const shouldMask = await checkFieldPermission({ ...input, field, operation: "masked" });
    if (shouldMask.allowed) (masked as Record<string, unknown>)[field] = maskValue(masked[field]);
  }
  return masked;
}
