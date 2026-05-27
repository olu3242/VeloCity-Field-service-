// Automation ROI and operational efficiency scoring.

export interface AutomationROIMetrics {
  eventsAutoProcessed: number;
  estimatedManualHoursAvoided: number;
  estimatedLaborCostAvoided: number;
  aiExecutionCostUsd: number;
  netROIUsd: number;
  roiMultiplier: number;
  automationRate: number;
  periodLabel: string;
}

export interface WorkflowEfficiency {
  workflowId: string;
  avgDurationMs: number;
  humanInterventionRate: number;
  successRate: number;
  avgCostUsd: number;
  efficiencyScore: number;
}

const LABOR_HOURS_PER_EVENT = 0.25;
const LABOR_RATE_USD = 35;

export function calculateROI(metrics: {
  eventsAuto: number;
  eventsTotal: number;
  aiCostUsd: number;
  periodLabel: string;
}): AutomationROIMetrics {
  const estimatedManualHoursAvoided = metrics.eventsAuto * LABOR_HOURS_PER_EVENT;
  const estimatedLaborCostAvoided = estimatedManualHoursAvoided * LABOR_RATE_USD;
  const netROIUsd = estimatedLaborCostAvoided - metrics.aiCostUsd;
  const roiMultiplier =
    metrics.aiCostUsd > 0 ? estimatedLaborCostAvoided / metrics.aiCostUsd : 0;
  const automationRate =
    metrics.eventsTotal > 0 ? metrics.eventsAuto / metrics.eventsTotal : 0;

  return {
    eventsAutoProcessed: metrics.eventsAuto,
    estimatedManualHoursAvoided,
    estimatedLaborCostAvoided,
    aiExecutionCostUsd: metrics.aiCostUsd,
    netROIUsd,
    roiMultiplier,
    automationRate,
    periodLabel: metrics.periodLabel,
  };
}

export function scoreWorkflowEfficiency(wf: {
  workflowId: string;
  avgDurationMs: number;
  humanInterventionRate: number;
  successRate: number;
  avgCostUsd: number;
}): WorkflowEfficiency {
  const raw =
    wf.successRate * 50 +
    (1 - wf.humanInterventionRate) * 30 +
    Math.min(20, 20 * (1 - wf.avgDurationMs / 600_000));
  const efficiencyScore = Math.max(0, Math.min(100, raw));

  return {
    workflowId: wf.workflowId,
    avgDurationMs: wf.avgDurationMs,
    humanInterventionRate: wf.humanInterventionRate,
    successRate: wf.successRate,
    avgCostUsd: wf.avgCostUsd,
    efficiencyScore,
  };
}

export function getROISummary(roiList: AutomationROIMetrics[]): {
  totalNetROIUsd: number;
  avgMultiplier: number;
  bestPeriod: string;
} {
  if (roiList.length === 0) {
    return { totalNetROIUsd: 0, avgMultiplier: 0, bestPeriod: "N/A" };
  }

  const totalNetROIUsd = roiList.reduce((sum, r) => sum + r.netROIUsd, 0);
  const avgMultiplier =
    roiList.reduce((sum, r) => sum + r.roiMultiplier, 0) / roiList.length;
  const bestPeriod = roiList.reduce((best, r) =>
    r.netROIUsd > best.netROIUsd ? r : best
  ).periodLabel;

  return { totalNetROIUsd, avgMultiplier, bestPeriod };
}
