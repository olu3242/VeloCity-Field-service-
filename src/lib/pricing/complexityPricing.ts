export function calculateComplexityAdjustment(basePrice: number, complexity: "simple" | "moderate" | "complex" = "moderate"): number {
  if (complexity === "simple") return 0;
  if (complexity === "complex") return Math.round(basePrice * 0.35);
  return Math.round(basePrice * 0.15);
}
