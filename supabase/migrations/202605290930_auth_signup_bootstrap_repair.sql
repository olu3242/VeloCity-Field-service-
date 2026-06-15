-- VeloCity Field Service - Auth signup bootstrap repair
-- Repairs auth.users -> profiles bootstrap without editing historical migrations.

create schema if not exists app;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app.default_tenant_id()
returns uuid
language sql
immutable
set search_path = app, public
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

insert into public.tenants (id, slug, name)
values (app.default_tenant_id(), 'velocity-default', 'VeloCity Default Tenant')
on conflict (id) do nothing;

create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  jwt_tenant uuid;
  profile_tenant uuid;
begin
  begin
    jwt_tenant := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  exception when invalid_text_representation then
    jwt_tenant := null;
  end;

  if jwt_tenant is not null then
    return jwt_tenant;
  end if;

  select tenant_id
    into profile_tenant
  from public.profiles
  where id = auth.uid()
  limit 1;

  return coalesce(profile_tenant, app.default_tenant_id());
end;
$$;

create or replace function app.is_tenant_admin(target_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
begin
  if target_tenant_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and tenant_id = target_tenant_id
      and role = 'admin'
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, app, auth
as $$
declare
  requested_tenant uuid;
  requested_role user_role;
  raw_role text;
begin
  begin
    requested_tenant := nullif(new.raw_user_meta_data ->> 'tenant_id', '')::uuid;
  exception when invalid_text_representation then
    requested_tenant := null;
  end;

  raw_role := nullif(new.raw_user_meta_data ->> 'role', '');
  requested_role := case
    when raw_role in ('customer', 'provider', 'admin') then raw_role::user_role
    else 'customer'::user_role
  end;

  insert into public.profiles (
    id,
    tenant_id,
    role,
    full_name,
    avatar_url,
    metadata
  )
  values (
    new.id,
    coalesce(requested_tenant, app.default_tenant_id()),
    requested_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  )
  on conflict (id) do update set
    tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    metadata = coalesce(public.profiles.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

grant execute on function app.default_tenant_id() to authenticated, service_role;
grant execute on function app.current_tenant_id() to authenticated, service_role;
grant execute on function app.is_tenant_admin(uuid) to authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
