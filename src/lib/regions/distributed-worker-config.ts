export interface WorkerConfig {
  regionId: string;
  minWorkers: number;
  maxWorkers: number;
  targetConcurrency: number;
  priorityLaneEnabled: boolean;
  aiCallsPerWorker: number;
  healthCheckIntervalMs: number;
}

export const WORKER_CONFIGS: Map<string, WorkerConfig> = new Map<
  string,
  WorkerConfig
>();

WORKER_CONFIGS.set("us-east", {
  regionId: "us-east",
  minWorkers: 2,
  maxWorkers: 8,
  targetConcurrency: 5,
  priorityLaneEnabled: true,
  aiCallsPerWorker: 50,
  healthCheckIntervalMs: 10_000,
});

WORKER_CONFIGS.set("eu-west", {
  regionId: "eu-west",
  minWorkers: 1,
  maxWorkers: 4,
  targetConcurrency: 3,
  priorityLaneEnabled: false,
  aiCallsPerWorker: 25,
  healthCheckIntervalMs: 15_000,
});

export function setWorkerConfig(config: WorkerConfig): void {
  WORKER_CONFIGS.set(config.regionId, config);
}

export function getWorkerConfig(regionId: string): WorkerConfig {
  return (
    WORKER_CONFIGS.get(regionId) ?? {
      regionId,
      minWorkers: 1,
      maxWorkers: 4,
      targetConcurrency: 3,
      priorityLaneEnabled: false,
      aiCallsPerWorker: 20,
      healthCheckIntervalMs: 15_000,
    }
  );
}

export function getAllWorkerConfigs(): WorkerConfig[] {
  return Array.from(WORKER_CONFIGS.values());
}

export function computeOptimalWorkerCount(
  regionId: string,
  queueDepth: number
): number {
  const config = getWorkerConfig(regionId);
  const needed = Math.ceil(queueDepth / config.targetConcurrency);
  return Math.min(config.maxWorkers, Math.max(config.minWorkers, needed));
}
