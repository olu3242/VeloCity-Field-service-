import type { IncidentSeverity } from "./incident-manager";

export interface ClassificationInput {
  eventType: string;
  queueDepth?: number;
  failureRate?: number;
  tenantTier?: "standard" | "premium" | "enterprise";
  affectedTenantCount?: number;
  isPaymentRelated?: boolean;
}

export function classifySeverity(input: ClassificationInput): IncidentSeverity {
  const {
    eventType,
    queueDepth = 0,
    failureRate = 0,
    tenantTier,
    affectedTenantCount = 0,
    isPaymentRelated = false,
  } = input;

  // sev1: critical conditions
  if (
    (isPaymentRelated && failureRate > 0.5) ||
    affectedTenantCount > 10 ||
    (eventType.includes("sla_breach") && tenantTier === "enterprise")
  ) {
    return "sev1";
  }

  // sev2: high severity
  if (
    failureRate > 0.2 ||
    queueDepth > 200 ||
    affectedTenantCount > 5 ||
    isPaymentRelated
  ) {
    return "sev2";
  }

  // sev3: medium severity
  if (failureRate > 0.05 || queueDepth > 100 || tenantTier === "enterprise") {
    return "sev3";
  }

  // sev4: default
  return "sev4";
}

export function getSeverityLabel(severity: IncidentSeverity): string {
  switch (severity) {
    case "sev1":
      return "Critical";
    case "sev2":
      return "High";
    case "sev3":
      return "Medium";
    case "sev4":
      return "Low";
  }
}

export function getSeverityResponseSlaMs(severity: IncidentSeverity): number {
  switch (severity) {
    case "sev1":
      return 300_000; // 5 min
    case "sev2":
      return 900_000; // 15 min
    case "sev3":
      return 3_600_000; // 1 hr
    case "sev4":
      return 86_400_000; // 24 hr
  }
}
