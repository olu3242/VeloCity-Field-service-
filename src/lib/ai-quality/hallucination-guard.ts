export type HallucinationSignal =
  | "contradicts_known_state"
  | "unsupported_claim"
  | "excessive_confidence"
  | "format_violation"
  | "out_of_domain";

export interface HallucinationCheck {
  id: string;
  agentName: string;
  signal?: HallucinationSignal;
  flagged: boolean;
  confidence: number;
  checks: { rule: string; passed: boolean }[];
  timestamp: string;
}

const CHECKS: HallucinationCheck[] = [];
const CHECKS_CAP = 200;

export function checkForHallucination(
  agentName: string,
  output: Record<string, unknown>,
  confidence: number
): HallucinationCheck {
  const checks: { rule: string; passed: boolean }[] = [
    { rule: "confidence_in_range", passed: confidence >= 0 && confidence <= 1 },
    { rule: "not_excessive_confidence", passed: confidence <= 0.99 },
    { rule: "output_not_empty", passed: Object.keys(output).length > 0 },
    {
      rule: "no_contradictory_keys",
      passed: !("yes" in output && "no" in output),
    },
  ];

  const anyFailed = checks.some((c) => !c.passed);
  const flagged = anyFailed || confidence > 0.99;

  let signal: HallucinationSignal | undefined;
  if (confidence > 0.99) {
    signal = "excessive_confidence";
  } else {
    const failedRule = checks.find((c) => !c.passed);
    if (failedRule) signal = "format_violation";
  }

  const check: HallucinationCheck = {
    id: crypto.randomUUID(),
    agentName,
    signal,
    flagged,
    confidence,
    checks,
    timestamp: new Date().toISOString(),
  };

  if (CHECKS.length >= CHECKS_CAP) CHECKS.shift();
  CHECKS.push(check);

  return check;
}

export function getFlaggedChecks(agentName?: string): HallucinationCheck[] {
  return CHECKS.filter(
    (c) => c.flagged && (agentName === undefined || c.agentName === agentName)
  );
}

export function getHallucinationRate(agentName: string): number {
  const agentChecks = CHECKS.filter((c) => c.agentName === agentName);
  if (agentChecks.length === 0) return 0;
  return agentChecks.filter((c) => c.flagged).length / agentChecks.length;
}

export function getRecentChecks(limit = 20): HallucinationCheck[] {
  return CHECKS.slice(-limit);
}
