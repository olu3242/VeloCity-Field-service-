import "@/runtime/server-only";
import { env, getEnvStatus } from "@/config/env";

export function getEnvironmentDiagnostics() {
  const status = getEnvStatus();
  return {
    mode: env.isProduction ? "production" : "development",
    degraded: Object.entries(status)
      .filter(([, group]) => group.missing.length > 0)
      .map(([area, group]) => ({ area, missing: group.missing })),
    featureFlags: env.features,
  };
}
