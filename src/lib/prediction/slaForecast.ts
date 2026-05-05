export interface SlaForecast {
  breachRisk: "low" | "medium" | "high";
  riskScore: number;
  explanation: string;
}

export function forecastSlaRisk(input: { openJobs: number; activeProviders: number; emergencyJobs: number; averageResponseMinutes?: number }): SlaForecast {
  const riskScore = Math.min(100, input.openJobs * 4 + input.emergencyJobs * 12 + Math.max(0, (input.averageResponseMinutes ?? 20) - 20) - input.activeProviders * 5);
  return {
    riskScore: Math.round(riskScore),
    breachRisk: riskScore > 70 ? "high" : riskScore > 35 ? "medium" : "low",
    explanation: `SLA risk considers ${input.openJobs} open jobs, ${input.emergencyJobs} emergency jobs, and ${input.activeProviders} active providers.`,
  };
}
