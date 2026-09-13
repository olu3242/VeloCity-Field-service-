-- Pilot P0: secure app-owned operational tables and privileged bootstrap helpers.

alter table public.sla_configs enable row level security;

revoke all on table public.sla_configs from anon;
revoke all on table public.sla_configs from authenticated;
grant select on table public.sla_configs to authenticated;
grant all on table public.sla_configs to service_role;

drop policy if exists "Authenticated users read SLA configs" on public.sla_configs;
create policy "Authenticated users read SLA configs"
on public.sla_configs for select
to authenticated
using ((select auth.uid()) is not null);

revoke all on table public.payment_retries from anon, authenticated;
revoke all on table public.subscription_events from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.user_permission_overrides from anon, authenticated;

grant all on table public.payment_retries to service_role;
grant all on table public.subscription_events to service_role;
grant all on table public.subscriptions to service_role;
grant all on table public.user_permission_overrides to service_role;

drop policy if exists "Service role manages payment retries" on public.payment_retries;
create policy "Service role manages payment retries" on public.payment_retries
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages subscription events" on public.subscription_events;
create policy "Service role manages subscription events" on public.subscription_events
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages subscriptions" on public.subscriptions;
create policy "Service role manages subscriptions" on public.subscriptions
for all to service_role using (true) with check (true);

drop policy if exists "Tenant admins manage permission overrides" on public.user_permission_overrides;
create policy "Tenant admins manage permission overrides" on public.user_permission_overrides
for all to authenticated
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

grant select, insert, update, delete on table public.user_permission_overrides to authenticated;

-- Trigger execution does not require clients to invoke this function directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
