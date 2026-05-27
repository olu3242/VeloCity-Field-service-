/**
 * Orchestration failover routing — maps agent failures to recovery strategies.
 */

export type FailoverStrategy =
  | "retry"
  | "fallback_agent"
  | "human_escalation"
  | "graceful_skip";

export interface FailoverDecision {
  originalAgent: string;
  strategy: FailoverStrategy;
  fallbackAgent?: string;
  reason: string;
  escalate: boolean;
}

const FAILOVER_RULES: Map<string, FailoverStrategy> = new Map([
  ["IVY", "fallback_agent"],
  ["FINN", "retry"],
  ["GABRIEL", "retry"],
  ["MAX", "fallback_agent"],
  ["default", "human_escalation"],
]);

const HISTORY: FailoverDecision[] = [];
const MAX_HISTORY = 100;

const FALLBACK_AGENTS: Record<string, string> = {
  IVY: "GABRIEL",
  MAX: "IVY",
};

export function resolveFailover(
  agentName: string,
  error: string,
  attemptCount: number,
): FailoverDecision {
  let strategy: FailoverStrategy =
    FAILOVER_RULES.get(agentName) ??
    FAILOVER_RULES.get("default") ??
    "human_escalation";

  // Escalate retries that have exceeded the attempt limit
  if (strategy === "retry" && attemptCount >= 3) {
    strategy = "human_escalation";
  }

  const fallbackAgent =
    strategy === "fallback_agent" ? FALLBACK_AGENTS[agentName] : undefined;

  const escalate = strategy === "human_escalation";

  const reason =
    strategy === "human_escalation"
      ? `Agent ${agentName} failed after ${attemptCount} attempt(s) — escalating to human review. Error: ${error}`
      : strategy === "fallback_agent"
        ? `Agent ${agentName} unavailable — routing to fallback agent ${fallbackAgent ?? "unknown"}. Error: ${error}`
        : strategy === "retry"
          ? `Agent ${agentName} encountered a transient error — scheduling retry (attempt ${attemptCount}). Error: ${error}`
          : `Agent ${agentName} step skipped gracefully. Error: ${error}`;

  const decision: FailoverDecision = {
    originalAgent: agentName,
    strategy,
    fallbackAgent,
    reason,
    escalate,
  };

  if (HISTORY.length >= MAX_HISTORY) {
    HISTORY.shift();
  }
  HISTORY.push(decision);

  return decision;
}

export function registerFailoverRule(
  agentName: string,
  strategy: FailoverStrategy,
): void {
  FAILOVER_RULES.set(agentName, strategy);
}

export function getFailoverHistory(): FailoverDecision[] {
  return [...HISTORY];
}
