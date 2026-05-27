export interface WorkflowDependency {
  fromEventType: string;
  toEventType: string;
  dependencyType: "triggers" | "requires" | "optional";
  frequency: number;
  avgDelayMs: number;
}

const DEPENDENCIES: Map<string, WorkflowDependency> = new Map();

function depKey(from: string, to: string): string {
  return `${from}→${to}`;
}

export function recordDependency(
  from: string,
  to: string,
  type: WorkflowDependency["dependencyType"],
  delayMs: number
): void {
  const key = depKey(from, to);
  const existing = DEPENDENCIES.get(key);
  if (existing) {
    const newFreq = existing.frequency + 1;
    existing.avgDelayMs =
      (existing.avgDelayMs * existing.frequency + delayMs) / newFreq;
    existing.frequency = newFreq;
    existing.dependencyType = type;
  } else {
    DEPENDENCIES.set(key, {
      fromEventType: from,
      toEventType: to,
      dependencyType: type,
      frequency: 1,
      avgDelayMs: delayMs,
    });
  }
}

export function getDependenciesFrom(eventType: string): WorkflowDependency[] {
  return Array.from(DEPENDENCIES.values()).filter(
    (d) => d.fromEventType === eventType
  );
}

export function getDependenciesTo(eventType: string): WorkflowDependency[] {
  return Array.from(DEPENDENCIES.values()).filter(
    (d) => d.toEventType === eventType
  );
}

export function getFullGraph(): WorkflowDependency[] {
  return Array.from(DEPENDENCIES.values());
}

export function findCriticalPath(startEventType: string): string[] {
  const MAX_DEPTH = 10;
  const path: string[] = [startEventType];
  const visited = new Set<string>([startEventType]);
  let current = startEventType;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const next = Array.from(DEPENDENCIES.values()).find(
      (d) =>
        d.fromEventType === current &&
        d.dependencyType === "triggers" &&
        !visited.has(d.toEventType)
    );
    if (!next) break;
    path.push(next.toEventType);
    visited.add(next.toEventType);
    current = next.toEventType;
  }

  return path;
}
