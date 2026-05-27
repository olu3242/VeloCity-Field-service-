# /new-agent

Scaffold a new AI agent for VeloCity.

## Usage
```
/new-agent [agent-name] [agent-role]
Example: /new-agent diana "Scheduling optimization agent"
```

## Steps

1. Create `src/lib/agents/schemas/[name].ts` — input/output Zod schemas
2. Create `src/lib/agents/prompts/[name].ts` — system prompt constant
3. Create `src/lib/agents/runners/[name].ts` — agent runner function
4. Create `src/app/api/agents/[name]/route.ts` — Next.js API route
5. Create `src/lib/agents/__tests__/[name].test.ts` — unit test with mock responses
6. Add agent to `src/lib/agents/registry.ts`
7. Add agent to `ai_agents` seed record in `supabase/seed.sql`

## Agent Template

All agents follow this contract pattern:

```typescript
// Schema
export const [Name]InputSchema = z.object({ /* ... */ });
export type [Name]Input = z.infer<typeof [Name]InputSchema>;
export type [Name]Output = { /* ... */ admin_review_required: boolean };

// System Prompt  
export const [NAME]_SYSTEM_PROMPT = `
You are [NAME], the [Role] agent for VeloCity Field Service.
[Context]. [Responsibilities]. [Rules].
Always respond with valid JSON matching the output schema.
Output schema: { ... }
`;

// Runner
export async function run[Name]Agent(input: [Name]Input): Promise<[Name]Output> { /* ... */ }

// Route — POST /api/agents/[name]
```
