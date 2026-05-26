import type { IncidentSeverity } from "./incident-manager";

export interface EscalationStep {
  stepNumber: number;
  target: string;
  notificationMethod: string;
  triggerAfterMs: number;
  escalatedAt?: string;
  acknowledged: boolean;
}

export interface EscalationChain {
  incidentId: string;
  severity: IncidentSeverity;
  steps: EscalationStep[];
  currentStep: number;
  startedAt: string;
  completedAt?: string;
}

const CHAINS: Map<string, EscalationChain> = new Map();

function buildDefaultSteps(severity: IncidentSeverity): EscalationStep[] {
  switch (severity) {
    case "sev1":
      return [
        { stepNumber: 0, target: "on-call", notificationMethod: "pager", triggerAfterMs: 5 * 60_000, acknowledged: false },
        { stepNumber: 1, target: "engineering-lead", notificationMethod: "pager", triggerAfterMs: 10 * 60_000, acknowledged: false },
        { stepNumber: 2, target: "vp-engineering", notificationMethod: "pager", triggerAfterMs: 20 * 60_000, acknowledged: false },
      ];
    case "sev2":
      return [
        { stepNumber: 0, target: "on-call", notificationMethod: "slack", triggerAfterMs: 15 * 60_000, acknowledged: false },
        { stepNumber: 1, target: "engineering-lead", notificationMethod: "slack", triggerAfterMs: 30 * 60_000, acknowledged: false },
      ];
    case "sev3":
      return [
        { stepNumber: 0, target: "on-call", notificationMethod: "email", triggerAfterMs: 60 * 60_000, acknowledged: false },
      ];
    case "sev4":
      return [
        { stepNumber: 0, target: "on-call", notificationMethod: "email", triggerAfterMs: 24 * 60 * 60_000, acknowledged: false },
      ];
  }
}

export function startEscalationChain(
  incidentId: string,
  severity: IncidentSeverity
): EscalationChain {
  const chain: EscalationChain = {
    incidentId,
    severity,
    steps: buildDefaultSteps(severity),
    currentStep: 0,
    startedAt: new Date().toISOString(),
  };
  CHAINS.set(incidentId, chain);
  return chain;
}

export function advanceEscalation(incidentId: string): EscalationChain | undefined {
  const chain = CHAINS.get(incidentId);
  if (!chain || chain.completedAt !== undefined) return chain;

  const step = chain.steps[chain.currentStep];
  if (step !== undefined && !step.acknowledged) {
    step.escalatedAt = new Date().toISOString();
    chain.currentStep += 1;
  }

  if (chain.currentStep >= chain.steps.length) {
    chain.completedAt = new Date().toISOString();
  }

  return chain;
}

export function acknowledgeStep(incidentId: string, stepNumber: number): void {
  const chain = CHAINS.get(incidentId);
  if (!chain) return;
  const step = chain.steps.find((s) => s.stepNumber === stepNumber);
  if (step !== undefined) {
    step.acknowledged = true;
  }
}

export function getActiveChains(): EscalationChain[] {
  return Array.from(CHAINS.values()).filter((c) => c.completedAt === undefined);
}

export function cancelChain(incidentId: string): void {
  const chain = CHAINS.get(incidentId);
  if (chain !== undefined) {
    chain.completedAt = new Date().toISOString();
  }
}
