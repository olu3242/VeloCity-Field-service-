-- Migration 016: durable, versioned outcome contract for the standard service-job lifecycle.
-- The existing jobs FSM remains authoritative; this projection proves the business outcome.

create table if not exists public.workflow_outcome_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  job_id uuid not null references public.jobs(id) on delete cascade,
  contract_id text not null,
  contract_version text not null,
  stage text not null default 'intake'
    check (stage in ('intake','dispatch','execution','verification','financial_closeout','recovery','complete')),
  verdict text not null default 'in_progress'
    check (verdict in ('in_progress','blocked','satisfied','failed')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  requires_human_action boolean not null default false,
  next_action text,
  checkpoints jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, contract_id, contract_version)
);

create index if not exists workflow_outcomes_tenant_stage_idx
  on public.workflow_outcome_instances (tenant_id, stage, verdict);
create index if not exists workflow_outcomes_human_action_idx
  on public.workflow_outcome_instances (tenant_id, requires_human_action)
  where requires_human_action = true;

alter table public.workflow_outcome_instances enable row level security;

drop policy if exists "Customers see own job outcomes" on public.workflow_outcome_instances;
create policy "Customers see own job outcomes"
  on public.workflow_outcome_instances for select
  using (exists (
    select 1 from public.jobs j
    where j.id = workflow_outcome_instances.job_id
      and j.tenant_id = workflow_outcome_instances.tenant_id
      and j.customer_id = auth.uid()
  ));

drop policy if exists "Providers see assigned job outcomes" on public.workflow_outcome_instances;
create policy "Providers see assigned job outcomes"
  on public.workflow_outcome_instances for select
  using (exists (
    select 1 from public.jobs j
    join public.providers p on p.id = j.provider_id
    where j.id = workflow_outcome_instances.job_id
      and j.tenant_id = workflow_outcome_instances.tenant_id
      and p.user_id = auth.uid()
  ));

drop policy if exists "Admins see tenant job outcomes" on public.workflow_outcome_instances;
create policy "Admins see tenant job outcomes"
  on public.workflow_outcome_instances for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.tenant_id = workflow_outcome_instances.tenant_id
  ));

drop policy if exists "Service role manages job outcomes" on public.workflow_outcome_instances;
create policy "Service role manages job outcomes"
  on public.workflow_outcome_instances for all to service_role
  using (true) with check (true);

drop trigger if exists workflow_outcome_instances_updated_at on public.workflow_outcome_instances;
create trigger workflow_outcome_instances_updated_at
  before update on public.workflow_outcome_instances
  for each row execute function public.update_updated_at();
