-- Consolidate persona read access into one policy so Postgres evaluates a
-- single permissive SELECT policy per authenticated request.

drop policy if exists "Customers see own job outcomes" on public.workflow_outcome_instances;
drop policy if exists "Providers see assigned job outcomes" on public.workflow_outcome_instances;
drop policy if exists "Admins see tenant job outcomes" on public.workflow_outcome_instances;

create policy "Authorized personas see job outcomes"
  on public.workflow_outcome_instances for select to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = workflow_outcome_instances.job_id
        and j.tenant_id = workflow_outcome_instances.tenant_id
        and j.customer_id = (select auth.uid())
    )
    or exists (
      select 1 from public.jobs j
      join public.providers p on p.id = j.provider_id
      where j.id = workflow_outcome_instances.job_id
        and j.tenant_id = workflow_outcome_instances.tenant_id
        and p.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.tenant_id = workflow_outcome_instances.tenant_id
    )
  );

