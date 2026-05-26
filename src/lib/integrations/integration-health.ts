import {
  getAllAdapterHealth,
  type AdapterHealth,
} from "@/lib/integrations/adapter-contract";
import { getDeliveryStats } from "@/lib/integrations/delivery-tracker";

export interface IntegrationHealthReport {
  timestamp: string;
  adapters: AdapterHealth[];
  deliveryStats: { total: number; delivered: number; failed: number; deadLetter: number };
  deadLetterItems: number;
  overallHealth: "healthy" | "degraded" | "critical";
  alerts: string[];
}

export function buildHealthReport(): IntegrationHealthReport {
  const adapters = getAllAdapterHealth();
  const { total, delivered, failed, deadLetter, retrying: _retrying } = getDeliveryStats();
  const deliveryStats = { total, delivered, failed, deadLetter };

  const alerts: string[] = [];

  const hasOffline = adapters.some((a) => a.status === "offline");
  const hasDegraded = adapters.some((a) => a.status === "degraded");

  // Specific adapter alerts
  const stripeHealth = adapters.find((a) => a.adapterId === "stripe");
  if (stripeHealth?.status === "offline") {
    alerts.push("Critical: Stripe adapter offline — payments may fail");
  }

  if (deadLetter > 5) {
    alerts.push(`Dead letter queue accumulating (${deadLetter} items)`);
  }

  for (const adapter of adapters) {
    if (adapter.status === "offline" && adapter.adapterId !== "stripe") {
      alerts.push(`Adapter offline: ${adapter.name}`);
    } else if (adapter.status === "degraded") {
      alerts.push(`Adapter degraded: ${adapter.name} (success rate: ${(adapter.successRate * 100).toFixed(1)}%)`);
    }
  }

  let overallHealth: "healthy" | "degraded" | "critical";
  if (hasOffline || deadLetter > 10) {
    overallHealth = "critical";
  } else if (hasDegraded) {
    overallHealth = "degraded";
  } else {
    overallHealth = "healthy";
  }

  return {
    timestamp: new Date().toISOString(),
    adapters,
    deliveryStats,
    deadLetterItems: deadLetter,
    overallHealth,
    alerts,
  };
}

export function monitorIntegrations(): IntegrationHealthReport {
  return buildHealthReport();
}
