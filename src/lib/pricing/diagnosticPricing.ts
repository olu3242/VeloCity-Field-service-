import type { ServiceCategory } from "@/types";

export function calculateDiagnosticFee(category: ServiceCategory, configured = true): number {
  if (!configured) return 0;
  if (category === "hvac" || category === "appliance_repair") return 8900;
  if (category === "electrical" || category === "plumbing") return 7900;
  return 5900;
}
