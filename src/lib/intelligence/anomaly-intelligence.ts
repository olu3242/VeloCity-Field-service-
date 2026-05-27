export type AnomalyCategory = "operational" | "financial" | "behavioral" | "technical" | "security";

export interface AnomalyCluster {
  clusterId: string;
  category: AnomalyCategory;
  anomalyTypes: string[];
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  severity: "low" | "medium" | "high" | "critical";
  correlations: string[];
  recommendedAction: string;
}

export interface AnomalyIntelligenceReport {
  clusters: AnomalyCluster[];
  riskTrend: "improving" | "stable" | "degrading";
  topRisks: string[];
  recommendedInterventions: Array<{
    action: string;
    priority: "low" | "medium" | "high" | "critical";
    domain: string;
  }>;
}

const CLUSTERS = new Map<string, AnomalyCluster>();

function buildClusterKey(category: AnomalyCategory, type: string): string {
  return `${category}:${type}`;
}

function defaultAction(severity: AnomalyCluster["severity"]): string {
  if (severity === "critical") return "Immediate investigation and remediation required";
  if (severity === "high") return "Escalate to on-call team within 1 hour";
  if (severity === "medium") return "Schedule review within 24 hours";
  return "Monitor and log for trend analysis";
}

export function recordAnomaly(
  type: string,
  category: AnomalyCategory,
  severity: AnomalyCluster["severity"],
  entityId?: string
): void {
  const key = buildClusterKey(category, type);
  const now = new Date().toISOString();
  const existing = CLUSTERS.get(key);

  if (existing) {
    existing.frequency += 1;
    existing.lastSeen = now;
    if (!existing.anomalyTypes.includes(type)) existing.anomalyTypes.push(type);
    if (entityId && !existing.correlations.includes(entityId)) {
      existing.correlations.push(entityId);
    }
    // Upgrade severity if new occurrence is more severe
    const severityOrder: AnomalyCluster["severity"][] = ["low", "medium", "high", "critical"];
    if (severityOrder.indexOf(severity) > severityOrder.indexOf(existing.severity)) {
      existing.severity = severity;
      existing.recommendedAction = defaultAction(severity);
    }
  } else {
    const cluster: AnomalyCluster = {
      clusterId: key,
      category,
      anomalyTypes: [type],
      frequency: 1,
      firstSeen: now,
      lastSeen: now,
      severity,
      correlations: entityId ? [entityId] : [],
      recommendedAction: defaultAction(severity),
    };
    CLUSTERS.set(key, cluster);
  }
}

export function buildIntelligenceReport(): AnomalyIntelligenceReport {
  const clusters = Array.from(CLUSTERS.values());

  const criticalCount = clusters.filter((c) => c.severity === "critical").length;
  const highCount = clusters.filter((c) => c.severity === "high").length;

  let riskTrend: AnomalyIntelligenceReport["riskTrend"] = "stable";
  if (criticalCount > 0 || highCount > 2) riskTrend = "degrading";
  else if (criticalCount === 0 && highCount === 0) riskTrend = "improving";

  const topRisks = [...clusters]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3)
    .map(
      (c) =>
        `${c.category} anomaly "${c.anomalyTypes[0]}" — ${c.frequency} occurrences (${c.severity})`
    );

  const recommendedInterventions: Array<{
    action: string;
    priority: "low" | "medium" | "high" | "critical";
    domain: string;
  }> = clusters
    .filter((c) => c.severity === "critical" || c.severity === "high")
    .map((c) => ({
      action: c.recommendedAction,
      priority: c.severity as "high" | "critical",
      domain: c.category,
    }));

  // Add medium interventions if no critical/high exist
  if (recommendedInterventions.length === 0) {
    clusters
      .filter((c) => c.severity === "medium")
      .slice(0, 3)
      .forEach((c) =>
        recommendedInterventions.push({
          action: c.recommendedAction,
          priority: "medium" as const,
          domain: c.category,
        })
      );
  }

  return { clusters, riskTrend, topRisks, recommendedInterventions };
}

export function clearExpiredClusters(maxAgeHours = 48): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();
  let removed = 0;
  for (const [key, cluster] of Array.from(CLUSTERS.entries())) {
    if (cluster.lastSeen < cutoff) {
      CLUSTERS.delete(key);
      removed++;
    }
  }
  return removed;
}
