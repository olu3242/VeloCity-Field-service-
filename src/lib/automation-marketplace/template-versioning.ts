/**
 * Version history tracking for automation marketplace templates.
 */

export interface TemplateVersion {
  templateId: string;
  version: string;
  changelog: string;
  publishedAt: string;
  deprecated: boolean;
  snapshot: Record<string, unknown>;
}

const VERSIONS: Map<string, TemplateVersion[]> = new Map();

export function publishVersion(
  templateId: string,
  version: string,
  changelog: string,
  snapshot: Record<string, unknown>,
): TemplateVersion {
  const entry: TemplateVersion = {
    templateId,
    version,
    changelog,
    publishedAt: new Date().toISOString(),
    deprecated: false,
    snapshot,
  };

  const existing = VERSIONS.get(templateId) ?? [];
  existing.push(entry);
  VERSIONS.set(templateId, existing);
  return entry;
}

export function getVersionHistory(templateId: string): TemplateVersion[] {
  return [...(VERSIONS.get(templateId) ?? [])];
}

export function getLatestVersion(templateId: string): TemplateVersion | undefined {
  const history = VERSIONS.get(templateId);
  if (!history || history.length === 0) return undefined;
  return history[history.length - 1];
}

export function deprecateVersion(templateId: string, version: string): void {
  const history = VERSIONS.get(templateId);
  if (!history) return;
  for (const v of history) {
    if (v.version === version) {
      v.deprecated = true;
    }
  }
}

export function getActiveVersions(templateId: string): TemplateVersion[] {
  return (VERSIONS.get(templateId) ?? []).filter((v) => !v.deprecated);
}
