import { redirect } from "next/navigation";
import { checkPermission } from "./checkPermission";
import type { EnforceRouteAccessInput, PermissionObject } from "./types";

function objectForRoute(route: string): PermissionObject {
  if (route.includes("/settings")) return "settings";
  if (route.includes("/payments")) return "payments";
  if (route.includes("/payouts")) return "payout_ledger";
  if (route.includes("/providers")) return "providers";
  if (route.includes("/automation")) return "automation_queue";
  if (route.includes("/disputes")) return "disputes";
  if (route.includes("/jobs")) return "jobs";
  if (route.includes("/command-center")) return "command_center";
  return "audit_logs";
}

export async function enforceRouteAccess(input: EnforceRouteAccessInput) {
  const decision = await checkPermission({
    tenantId: input.tenantId,
    userId: input.userId,
    object: objectForRoute(input.route),
    action: input.action,
    route: input.route,
  });
  if (!decision.allowed) redirect("/dashboard");
  return decision;
}
