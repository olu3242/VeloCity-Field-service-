export type ComplianceFramework = "GDPR" | "CCPA" | "SOC2" | "HIPAA" | "PCI_DSS";

export interface ComplianceTag {
  dataId: string;
  dataType: string;
  frameworks: ComplianceFramework[];
  containsPII: boolean;
  sensitivityLevel: "public" | "internal" | "confidential" | "restricted";
  taggedAt: string;
  taggedBy: string;
}

export const TAGS: Map<string, ComplianceTag> = new Map<string, ComplianceTag>();

export function tagData(
  dataId: string,
  dataType: string,
  frameworks: ComplianceFramework[],
  containsPII: boolean,
  sensitivityLevel: ComplianceTag["sensitivityLevel"],
  taggedBy: string = "system"
): ComplianceTag {
  const tag: ComplianceTag = {
    dataId,
    dataType,
    frameworks,
    containsPII,
    sensitivityLevel,
    taggedAt: new Date().toISOString(),
    taggedBy,
  };
  TAGS.set(dataId, tag);
  return tag;
}

export function getTag(dataId: string): ComplianceTag | undefined {
  return TAGS.get(dataId);
}

export function getTagsByFramework(
  framework: ComplianceFramework
): ComplianceTag[] {
  return Array.from(TAGS.values()).filter((t) =>
    t.frameworks.includes(framework)
  );
}

export function getPIIData(): ComplianceTag[] {
  return Array.from(TAGS.values()).filter((t) => t.containsPII === true);
}

export function getTagsByLevel(
  level: ComplianceTag["sensitivityLevel"]
): ComplianceTag[] {
  return Array.from(TAGS.values()).filter((t) => t.sensitivityLevel === level);
}

export function untagData(dataId: string): void {
  TAGS.delete(dataId);
}
