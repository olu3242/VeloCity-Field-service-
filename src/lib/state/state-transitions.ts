/**
 * State Transitions — records and validates workflow status transitions.
 * Cap: 500 transitions (rolling).
 */

import { isRuntimePaused } from "@/lib/governance/operator";
import type { WorkflowState } from "./workflow-state";

export interface StateTransition {
  id: string;
  workflowId: string;
  tenantId: string;
  fromStatus: WorkflowState["status"];
  toStatus: WorkflowState["status"];
  triggeredBy: string;
  transitionedAt: string;
  valid: boolean;
}

export const TRANSITIONS: StateTransition[] = [];
const CAP = 500;

type Status = WorkflowState["status"];

const VALID_TRANSITIONS: Record<Status, Status[]> = {
  pending: ["running"],
  running: ["completed", "failed", "paused"],
  paused: ["running"],
  failed: ["pending"],
  completed: [],
};

export function isValidTransition(from: Status, to: Status): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function recordTransition(
  workflowId: string,
  tenantId: string,
  fromStatus: Status,
  toStatus: Status,
  triggeredBy: string
): StateTransition {
  if (isRuntimePaused()) {
    const t: StateTransition = {
      id: crypto.randomUUID(),
      workflowId,
      tenantId,
      fromStatus,
      toStatus,
      triggeredBy,
      transitionedAt: new Date().toISOString(),
      valid: false,
    };
    return t;
  }

  const transition: StateTransition = {
    id: crypto.randomUUID(),
    workflowId,
    tenantId,
    fromStatus,
    toStatus,
    triggeredBy,
    transitionedAt: new Date().toISOString(),
    valid: isValidTransition(fromStatus, toStatus),
  };

  if (TRANSITIONS.length >= CAP) {
    TRANSITIONS.splice(0, 1);
  }

  TRANSITIONS.push(transition);
  return transition;
}

export function getTransitionHistory(workflowId: string): StateTransition[] {
  return TRANSITIONS.filter((t) => t.workflowId === workflowId);
}

export function getInvalidTransitions(): StateTransition[] {
  return TRANSITIONS.filter((t) => !t.valid);
}
