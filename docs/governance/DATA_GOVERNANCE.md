# VeloCity Data Governance

## Overview

The data governance layer (`src/lib/data-governance/`) enforces retention policies, tenant data boundaries, compliance tagging, and audit retention scheduling — ensuring VeloCity operates within GDPR, CCPA, SOC2, and enterprise compliance frameworks.

---

## Retention Policies (`retention-policy.ts`)

Pre-defined retention rules for every data category:

| Category | Retention | Archive | Encrypted | Compliance Tags |
|---|---|---|---|---|
| audit_logs | 365 days | 730 days | ✅ | SOC2, GDPR |
| user_pii | 365 days | 730 days | ✅ | GDPR, CCPA, SOC2 |
| automation_events | 90 days | 365 days | ❌ | SOC2 |
| telemetry_snapshots | 90 days | 365 days | ❌ | SOC2 |
| operational_memory | 180 days | — | ❌ | SOC2 |
| webhook_payloads | 30 days | 90 days | ✅ | GDPR, CCPA |
| agent_traces | 30 days | 90 days | ❌ | — |

```typescript
isWithinRetention("audit_logs", 200);   // true (200 < 365)
isWithinRetention("agent_traces", 45);  // false (45 > 30)
getPoliciesByTag("GDPR");               // user_pii, webhook_payloads, audit_logs
getEncryptedCategories();               // ["audit_logs", "user_pii", "webhook_payloads"]
```

---

## Audit Retention (`audit-retention.ts`)

Tracking retention lifecycle for individual data records:

```typescript
const record = registerForRetention("tenant-abc", "audit_logs", "audit-entry-xyz");
// expiresAt = now + 365 days

getExpiredRecords("tenant-abc");   // records past expiresAt, not yet purged
getPurgeDueRecords();              // all expired, unpurged records platform-wide

markArchived(record.id);
markPurged(record.id);
```

Cap: 5,000 retention records in-memory (production path: persist to `data_retention` table).

---

## Tenant Data Boundaries (`tenant-boundaries.ts`)

Per-tenant data sovereignty and compliance controls:

```typescript
registerBoundary({
  tenantId: "enterprise-tenant",
  allowedDataCategories: ["audit_logs", "automation_events", "agent_traces"],
  restrictedOperations: ["bulk_export", "cross_tenant_read"],
  dataResidencyRegion: "eu-west",
  encryptionRequired: true,
  customRetentionDays: 60,     // shorten automation_events retention
  complianceLevel: "strict",
});

isOperationAllowed("enterprise-tenant", "bulk_export");  // false (restricted)

getEffectiveRetentionDays("enterprise-tenant", "automation_events");
// policy.retentionDays=90, tenantOverridable=true, customRetentionDays=60 → returns 60

getStrictComplianceTenants();  // all tenants with complianceLevel === "strict"
```

---

## Compliance Tagging (`compliance-tagger.ts`)

```typescript
tagData(
  "job-payout-record-123",
  "payout",
  ["GDPR", "PCI_DSS"],
  false,
  "confidential",
);

getTagsByFramework("PCI_DSS");   // all records under PCI scope
getPIIData();                    // all records with containsPII=true
getTagsByLevel("restricted");    // highest sensitivity records
```

Sensitivity levels: `public` < `internal` < `confidential` < `restricted`.

---

## Compliance Frameworks Covered

| Framework | Categories Governed | Required Action |
|---|---|---|
| GDPR | user_pii, webhook_payloads, audit_logs | Encryption, right-to-erasure support |
| CCPA | user_pii, webhook_payloads | Data subject access, opt-out |
| SOC2 | audit_logs, automation_events, telemetry | Retention, access logging |
| PCI_DSS | Payment data (tagged) | Encryption, audit trail |

---

## Production Integration Path

Current: in-memory store with retention tracking.

Production path:
- `registerForRetention()` writes to `data_retention` Supabase table
- Scheduled job (nightly) calls `getPurgeDueRecords()` and executes physical deletion
- `complianceTagger` entries stored in `compliance_tags` table
- Tenant boundaries persisted in `tenant_config` table
