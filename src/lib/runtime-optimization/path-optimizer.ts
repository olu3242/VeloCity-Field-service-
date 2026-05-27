export interface ExecutionPath {
  pathId: string;
  eventType: string;
  steps: string[];
  avgDurationMs: number;
  successRate: number;
  costUsd: number;
  lastUsedAt: string;
}

export interface PathRecommendation {
  eventType: string;
  recommendedPath: ExecutionPath;
  alternativePaths: ExecutionPath[];
  rationale: string;
}

const PATHS: Map<string, ExecutionPath[]> = new Map();
const PATHS_CAP = 10;

function scorePath(path: ExecutionPath): number {
  const durationScore = 1 - Math.min(1, path.avgDurationMs / 10_000);
  const costScore = 1 - Math.min(1, path.costUsd / 1);
  return path.successRate * 0.5 + durationScore * 0.3 + costScore * 0.2;
}

export function registerPath(path: ExecutionPath): void {
  const existing = PATHS.get(path.eventType) ?? [];
  if (existing.length >= PATHS_CAP) {
    existing.shift();
  }
  existing.push(path);
  PATHS.set(path.eventType, existing);
}

export function recordPathExecution(
  pathId: string,
  eventType: string,
  durationMs: number,
  success: boolean,
  costUsd: number
): void {
  const paths = PATHS.get(eventType);
  if (!paths) return;

  const path = paths.find((p) => p.pathId === pathId);
  if (!path) return;

  const successVal = success ? 1 : 0;
  path.avgDurationMs = path.avgDurationMs * 0.8 + durationMs * 0.2;
  path.successRate = path.successRate * 0.8 + successVal * 0.2;
  path.costUsd = costUsd;
  path.lastUsedAt = new Date().toISOString();
}

export function getOptimalPath(
  eventType: string
): PathRecommendation | undefined {
  const paths = PATHS.get(eventType);
  if (!paths || paths.length === 0) return undefined;

  const sorted = [...paths].sort((a, b) => scorePath(b) - scorePath(a));
  const [recommended, ...alternatives] = sorted;

  const score = Math.round(scorePath(recommended) * 100);
  return {
    eventType,
    recommendedPath: recommended,
    alternativePaths: alternatives,
    rationale: `Highest composite score (${score}/100) based on success rate, latency, and cost`,
  };
}

export function getAllPaths(): ExecutionPath[] {
  return Array.from(PATHS.values()).flat();
}
