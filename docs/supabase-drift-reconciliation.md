# Supabase Drift Reconciliation

## Current State

The linked Supabase project is an existing multi-tenant marketplace database. It already has remote migrations dated `20260424...`, while the local Velocity repo has local migrations `001` through `007`.

The schemas are intentionally not identical:

- Remote owns marketplace tables such as `tenants`, `users`, `artisans`, `services`, `bookings`, `system_events`, `automation_rules`, `automation_runs`, and `automation_logs`.
- Velocity adds MVP-specific compatibility tables such as `profiles`, `jobs`, `providers`, `provider_offers`, `quotes`, `agent_logs`, `automation_events`, and `automation_queue`.

## Do Not Do

- Do not run destructive migration repair blindly.
- Do not run `supabase db push` from the full local stack without reviewing generated SQL.
- Do not apply destructive `db diff` output that drops existing remote marketplace tables.
- Do not replace the Supabase project.

## Safe Apply Path

Because migration history diverges, apply only reviewed additive bridge migrations manually:

1. Review `supabase/migrations/006_velocity_additive_bridge.sql`.
2. Review `supabase/migrations/007_pricing_payments_automation.sql`.
3. Review `supabase/migrations/008_access_control_settings.sql`.
4. Apply each script manually in the Supabase SQL Editor or through `psql`.
4. Confirm no statements drop, rename, or alter incompatible existing columns.
5. Run seed after the additive schema exists.
6. Run tenant-specific automation and payment QA.

## Manual SQL Apply

Recommended:

```bash
# Review first, then apply through Supabase SQL Editor.
# Or use psql with the project connection string after review:
psql "$SUPABASE_DB_URL" -f supabase/migrations/006_velocity_additive_bridge.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/007_pricing_payments_automation.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/008_access_control_settings.sql
```

Keep service role and database passwords out of logs.
