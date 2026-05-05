import { scoreResult } from "@/lib/scoring/types";

export function calculateTerritoryOpportunityScore(input: { demandIndex: number; providerGap: number; medianIncomeIndex?: number; competitionIndex?: number }) {
  const score = input.demandIndex * 0.45 + input.providerGap * 8 + (input.medianIncomeIndex ?? 60) * 0.25 - (input.competitionIndex ?? 40) * 0.2;
  return scoreResult(score, ["Demand, provider gap, income, and competition drive opportunity."], ["Recruit supply before paid demand capture.", "Launch categories with immediate shortage."], { inverted: true });
}
