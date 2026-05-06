# /new-migration

Create a new Supabase migration file with the correct timestamp format.

## Usage
```
/new-migration [description]
Example: /new-migration add_trust_score_to_providers
```

## Steps
1. Generate filename: `supabase/migrations/[YYYYMMDDHHMMSS]_[description].sql`
2. Create the file with standard header comment
3. Include `-- +migrate Up` and `-- +migrate Down` sections
4. Always include: `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
5. Always enable RLS: `ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;`
6. Add basic RLS policies for authenticated users
7. Add `updated_at` trigger using the shared `update_updated_at_column()` function

## Template
```sql
-- Migration: [description]
-- Created: [timestamp]

-- +migrate Up

CREATE TABLE IF NOT EXISTS [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns here
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_[table_name]_updated_at
  BEFORE UPDATE ON [table_name]
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
CREATE POLICY "..." ON [table_name] FOR SELECT USING (...);

-- +migrate Down
DROP TABLE IF EXISTS [table_name];
```

---

# /scaffold-api

Generate a full CRUD API route for a resource.

## Usage
```
/scaffold-api [resource-name]
Example: /scaffold-api service-requests
```

## Output Files
- `src/app/api/[resource]/route.ts` — GET (list) + POST (create)
- `src/app/api/[resource]/[id]/route.ts` — GET (single) + PATCH (update) + DELETE
- `src/lib/validators/[resource].ts` — Zod schemas for create and update

## Rules
- GET list: always paginate (limit/offset), always filter by auth user
- POST: Zod parse body, then insert, return created record
- PATCH: Zod parse body (partial), update only provided fields
- DELETE: soft delete preferred (`deleted_at` timestamp) over hard delete
- All routes: return consistent `{ data, error }` shape

---

# /check-rls

Audit all Supabase tables for missing RLS policies.

## Steps
1. Query `information_schema.tables` for all `public` schema tables
2. Query `pg_policies` for all existing policies
3. List tables with RLS disabled or no policies
4. Suggest policy templates for each unprotected table

---

# /agent-test [name]

Run an isolated test for a specific agent with a sample payload.

## Steps
1. Load `src/lib/agents/schemas/[name].ts`
2. Load test fixture from `src/lib/agents/__tests__/fixtures/[name].json`
3. Invoke the agent runner directly (not via HTTP)
4. Print input, output, and validate output against schema
5. Report: pass/fail, latency, admin_review_required value

---

# /add-status [status]

Add a new job status to the state machine.

## Steps
1. Add status to the `JobStatus` enum in `src/types/jobs.ts`
2. Add allowed transitions in `src/lib/workflows/job-status-machine.ts`
3. Add status label/color to `src/lib/utils/job-status-display.ts`
4. Add migration to update any DB enum types if needed
5. Check if NOVA agent prompt needs updating for new stall detection rules
