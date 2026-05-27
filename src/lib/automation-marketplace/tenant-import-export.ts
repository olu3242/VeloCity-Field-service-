/**
 * Cross-tenant automation import/export for the marketplace.
 */

export interface AutomationExport {
  exportId: string;
  sourceTenantId: string;
  templateIds: string[];
  exportedAt: string;
  format: "json" | "yaml";
}

export interface AutomationImport {
  importId: string;
  targetTenantId: string;
  sourceExportId: string;
  importedAt: string;
  status: "pending" | "applied" | "failed";
  appliedTemplateIds: string[];
}

const MAX_RECORDS = 100;
const EXPORTS: AutomationExport[] = [];
const IMPORTS: AutomationImport[] = [];

export function exportAutomations(
  sourceTenantId: string,
  templateIds: string[],
): AutomationExport {
  const record: AutomationExport = {
    exportId: crypto.randomUUID(),
    sourceTenantId,
    templateIds: [...templateIds],
    exportedAt: new Date().toISOString(),
    format: "json",
  };
  if (EXPORTS.length >= MAX_RECORDS) EXPORTS.shift();
  EXPORTS.push(record);
  return record;
}

export function importAutomations(
  targetTenantId: string,
  sourceExportId: string,
): AutomationImport {
  const record: AutomationImport = {
    importId: crypto.randomUUID(),
    targetTenantId,
    sourceExportId,
    importedAt: new Date().toISOString(),
    status: "pending",
    appliedTemplateIds: [],
  };
  if (IMPORTS.length >= MAX_RECORDS) IMPORTS.shift();
  IMPORTS.push(record);
  return record;
}

export function applyImport(importId: string, appliedTemplateIds: string[]): void {
  const record = IMPORTS.find((i) => i.importId === importId);
  if (!record) return;
  record.status = "applied";
  record.appliedTemplateIds = [...appliedTemplateIds];
}

export function getTenantImports(tenantId: string): AutomationImport[] {
  return IMPORTS.filter((i) => i.targetTenantId === tenantId);
}

export function getTenantExports(tenantId: string): AutomationExport[] {
  return EXPORTS.filter((e) => e.sourceTenantId === tenantId);
}
