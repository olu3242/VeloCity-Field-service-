export interface ProviderSupplyForecast {
  expectedShortage: boolean;
  providersNeeded: number;
  explanation: string;
}

export function forecastProviderSupply(input: { expectedJobs: number; activeProviders: number; jobsPerProviderCapacity?: number }): ProviderSupplyForecast {
  const capacity = input.jobsPerProviderCapacity ?? 8;
  const providersNeeded = Math.max(0, Math.ceil(input.expectedJobs / capacity) - input.activeProviders);
  return {
    expectedShortage: providersNeeded > 0,
    providersNeeded,
    explanation: `${input.activeProviders} active providers can cover about ${input.activeProviders * capacity} jobs.`,
  };
}
