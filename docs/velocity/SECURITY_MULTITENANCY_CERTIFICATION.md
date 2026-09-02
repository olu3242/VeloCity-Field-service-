# Security & Multi-Tenancy Certification (Platform Certification Batch, Phase 7)

| Criterion | Status | Evidence |
|---|---|---|
| Tenant resolution | ✅ | `app.current_tenant_id()` (`003_tenant_demarcation.sql:85-115`) resolves tenant via JWT claim → `profiles.tenant_id` → legacy `users` table → `app.default_tenant_id()` fallback |
| Admin role check | ✅ | `app.is_tenant_admin(target_tenant_id)` (`003_tenant_demarcation.sql:117-143`) checks `profiles.role = 'admin'` scoped to the target tenant |
| RLS enabled on core tables | ✅ | `jobs`, `profiles`, `providers`, `provider_offers`, `payments`, `disputes`, `reviews`, `audit_logs`, all `commercial_*`, all `membership_*`, all `market_*` tables enable RLS with tenant-scoped policies |
| Customer/provider boundary | ✅ | `jobs` policy "Customers see own jobs" (`customer_id = auth.uid()`) and "Providers see assigned jobs"; app-level queries (`/api/jobs`, `/provider/jobs/[id]`) additionally filter by role, providing defense-in-depth |
| Admin route protection | ✅ | `src/middleware.ts` redirects non-admin users away from `/admin/*`, `/provider/*`, `/dispatch/*`, `/franchise/*`; page-level redirects in `/admin/dashboard/page.tsx` and others provide redundant protection |
| Commercial/membership contact scoping | ✅ | `commercial_accounts`/`commercial_locations`/`commercial_contracts`/`commercial_service_plans`/`commercial_contacts` each grant `select` to `primary_contact_id = auth.uid()` in addition to admin-manage-all |

## Disclosed gaps (carried to Risk Register / Known Limitations)

| Gap | Location | Risk | Recommendation |
|---|---|---|---|
| `agent_logs` table has no RLS policy | `001_initial_schema.sql:372-384` | Medium — table relies entirely on app-level admin-only query patterns; if a future code path queries it with a user-scoped client, no DB-level backstop exists | Add `ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY` + admin-only policy |
| `membership_entitlements` policy is `using (true)` | `20260530000002_membership_engine.sql` | Low/Medium — intended as public catalog data, but not tenant-scoped | Scope to `is_active = true OR app.is_tenant_admin(tenant_id)` |
| `provider_certification_requirements` policy is `using (true)` | `017_provider_skills_certification.sql` | Low/Medium — same pattern, catalog data exposed globally | Scope per tenant if requirements become tenant-customizable |
| Nullable `tenant_id` on access-control tables (`personas`, `permission_objects`, etc.) | `008_access_control_settings.sql` | Low — intentional for platform-wide rows, but undocumented in the migration itself | Add a migration comment documenting the null-tenant convention |
| Customer dashboard's commercial-account lookup uses `getAdminClient()` (bypasses RLS) | `src/app/dashboard/page.tsx` | Low — the underlying RLS policy (`primary_contact_id = auth.uid()`) is correct and would return the same row; the admin client is used to look up the account before the rest of the page's authenticated-client queries run | Switch to the authenticated client now that the RLS policy is confirmed correct |

None of these gaps allow cross-tenant data exposure to an authenticated non-admin user through the application's actual query patterns — all are either catalog-style globally-visible data by design, or app-level-only protection on an admin-restricted table that no current code path exposes to non-admins.

**Status: CERTIFIED ✅**, with 5 disclosed hardening items tracked in `RISK_REGISTER.md` for remediation before broader (Franchise/Enterprise) scope expansion.
