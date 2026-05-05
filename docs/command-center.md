# Revenue + Operations Command Center

## Route

- `/admin/command-center`

The command center is an executive operating layer for Velocity/JIT AI. It does not replace the existing admin dashboard or growth dashboard. It summarizes the health of revenue, operations, automation, marketplace liquidity, retention, and territory expansion.

## Library Files

- `src/lib/command-center/opsHealthScore.ts`
- `src/lib/command-center/revenueHealthScore.ts`
- `src/lib/command-center/automationHealthScore.ts`
- `src/lib/command-center/marketplaceHealthScore.ts`
- `src/lib/command-center/executiveSummary.ts`
- `src/lib/command-center/recommendedActions.ts`
- `src/lib/command-center/types.ts`
- `src/lib/command-center/index.ts`

## Widgets

- GMV
- Net revenue
- Commission revenue
- Average job value
- Active jobs
- Unassigned jobs
- SLA breaches
- Payment failures
- Payout queue
- Disputes
- Provider supply gaps
- Churn risk
- Territory readiness
- AI agent activity
- Failed automations

## Health Scores

All health scores are deterministic and auditable. They return a normalized `0-100` score, a severity level, reasons, and recommendations.

- Operations health: active jobs, unassigned jobs, SLA breaches, disputes, failed automations, provider coverage.
- Revenue health: GMV, commission revenue, take rate, average job value, payment failures, payout queue.
- Automation health: agent activity versus failed automations.
- Marketplace health: active provider ratio, supply gaps, unassigned jobs, completed job history.

## Auditable Recommendations

Recommended actions include:

- `id`
- `priority`
- `owner`
- `reason`
- `auditEvent`
- optional `href`

The page does not execute actions directly. It routes operators to the appropriate admin surface and keeps every recommendation explainable.

## Fallback Behavior

If Supabase returns no live rows, the command center renders deterministic fallback metrics instead of crashing. This keeps the executive dashboard useful in local development and during early tenant setup.

## QA Checklist

- Admin can access `/admin/command-center`.
- Non-admin users redirect away.
- Empty Supabase datasets render fallback metrics.
- KPI cards render without layout shifts.
- Risk and blocker alerts include auditable source labels.
- Recommended actions include audit event names.
- Command link appears in the existing admin dashboard.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
