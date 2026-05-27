/**
 * Dependency Mapper — tracks inter-policy dependencies and detects cycles.
 * Cap: 200 dependencies (rolling).
 */

export interface PolicyDependency {
  fromPolicyId: string;
  toPolicyId: string;
  dependencyType: "requires" | "overrides" | "inherits" | "triggers";
  createdAt: string;
}

export const DEPENDENCIES: PolicyDependency[] = [];
const CAP = 200;
const MAX_CYCLE_DEPTH = 10;

export function addDependency(
  fromPolicyId: string,
  toPolicyId: string,
  type: PolicyDependency["dependencyType"]
): PolicyDependency {
  const dep: PolicyDependency = {
    fromPolicyId,
    toPolicyId,
    dependencyType: type,
    createdAt: new Date().toISOString(),
  };

  if (DEPENDENCIES.length >= CAP) {
    DEPENDENCIES.splice(0, 1);
  }
  DEPENDENCIES.push(dep);
  return dep;
}

export function getDependencies(policyId: string): PolicyDependency[] {
  return DEPENDENCIES.filter((d) => d.fromPolicyId === policyId);
}

export function getDependents(policyId: string): PolicyDependency[] {
  return DEPENDENCIES.filter((d) => d.toPolicyId === policyId);
}

export function findCircularDependencies(): string[][] {
  const cycles: string[][] = [];
  const allIds = Array.from(
    new Set(DEPENDENCIES.flatMap((d) => [d.fromPolicyId, d.toPolicyId]))
  );

  for (const startId of allIds) {
    const queue: string[][] = [[startId]];
    while (queue.length > 0) {
      const path = queue.shift();
      if (!path) continue;
      if (path.length > MAX_CYCLE_DEPTH) continue;

      const current = path[path.length - 1];
      const neighbors = DEPENDENCIES
        .filter((d) => d.fromPolicyId === current)
        .map((d) => d.toPolicyId);

      for (const neighbor of neighbors) {
        if (neighbor === startId && path.length > 1) {
          cycles.push([...path, neighbor]);
        } else if (!path.includes(neighbor)) {
          queue.push([...path, neighbor]);
        }
      }
    }
  }

  return cycles;
}
