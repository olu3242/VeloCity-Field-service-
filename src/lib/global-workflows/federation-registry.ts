export interface FederatedWorkflow {
  id: string;
  workflowType: string;
  sourceRegion: string;
  targetRegions: string[];
  federationStatus: "synced" | "partial" | "failed";
  lastFederatedAt: string;
  tenantId: string;
}

const FEDERATED: Map<string, FederatedWorkflow> = new Map();
const CAP = 200;

export function registerFederation(
  workflowType: string,
  sourceRegion: string,
  targetRegions: string[],
  tenantId: string
): FederatedWorkflow {
  if (FEDERATED.size >= CAP) {
    const oldest = Array.from(FEDERATED.keys())[0];
    if (oldest !== undefined) {
      FEDERATED.delete(oldest);
    }
  }
  const fw: FederatedWorkflow = {
    id: crypto.randomUUID(),
    workflowType,
    sourceRegion,
    targetRegions,
    federationStatus: "synced",
    lastFederatedAt: new Date().toISOString(),
    tenantId,
  };
  FEDERATED.set(fw.id, fw);
  return fw;
}

export function updateFederationStatus(
  id: string,
  status: FederatedWorkflow["federationStatus"]
): void {
  const fw = FEDERATED.get(id);
  if (fw) {
    fw.federationStatus = status;
    fw.lastFederatedAt = new Date().toISOString();
  }
}

export function getFederatedWorkflows(tenantId?: string): FederatedWorkflow[] {
  const all = Array.from(FEDERATED.values());
  if (tenantId !== undefined) {
    return all.filter((fw) => fw.tenantId === tenantId);
  }
  return all;
}

export function getFailedFederations(): FederatedWorkflow[] {
  return Array.from(FEDERATED.values()).filter(
    (fw) => fw.federationStatus === "failed"
  );
}
