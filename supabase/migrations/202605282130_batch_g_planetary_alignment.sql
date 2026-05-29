-- Batch G + repository-aligned operational foundations.
-- Additive only. Centralized governance, service-role control, supervised autonomy.

do $$
declare
  table_name text;
  aligned_tables text[] := array[
    'planetary_operations_grid',
    'global_service_nodes',
    'planetary_operational_regions',
    'intercontinental_service_routes',
    'civilization_workforce_network',
    'global_provider_capacities',
    'planetary_workforce_flows',
    'service_skill_distribution',
    'continuity_operations',
    'critical_service_dependencies',
    'infrastructure_failover_networks',
    'resilience_recovery_models',
    'planetary_economic_models',
    'service_economy_flows',
    'global_liquidity_forecasts',
    'infrastructure_market_models',
    'resilience_intelligence',
    'systemic_recovery_models',
    'autonomous_failover_events',
    'resilience_optimization_cycles',
    'civilization_service_networks',
    'interoperable_service_layers',
    'cross_economy_coordination',
    'service_dependency_graphs',
    'emergency_operations_network',
    'critical_response_protocols',
    'global_escalation_routes',
    'crisis_coordination_models',
    'planetary_infrastructure_models',
    'systemic_operational_graphs',
    'global_dependency_intelligence',
    'infrastructure_health_networks',
    'stabilization_models',
    'autonomous_intervention_events',
    'systemic_risk_stabilization',
    'infrastructure_balance_models',
    'civilization_operations_fabric',
    'planetary_dependency_networks',
    'federated_operational_mesh',
    'systemic_coordination_layers',
    'runtime_health_metrics',
    'automation_failures',
    'runtime_events',
    'provider_leads',
    'provider_recruitment_campaigns',
    'provider_activation_metrics',
    'dispatch_attempts',
    'dispatch_escalations',
    'payout_accounts',
    'payout_adjustments',
    'enterprise_accounts',
    'sla_policies',
    'sla_events',
    'enterprise_contracts',
    'territories',
    'territory_regions',
    'territory_metrics',
    'territory_service_coverage',
    'ai_operational_insights'
  ];
begin
  foreach table_name in array aligned_tables loop
    execute format($sql$
      create table if not exists %I (
        id uuid primary key default gen_random_uuid(),
        tenant_id uuid references tenants(id) on delete cascade,
        territory_id uuid references franchise_territories(id) on delete set null,
        provider_id uuid references providers(id) on delete set null,
        customer_id uuid references profiles(id) on delete set null,
        job_id uuid references jobs(id) on delete set null,
        region_code text,
        market_code text,
        event_type text,
        subject_type text not null default 'operations',
        subject_id uuid,
        model_type text not null default 'operational',
        status text not null default 'active',
        severity text not null default 'info',
        priority integer not null default 50,
        score numeric(10,4) not null default 0,
        confidence numeric(5,4) not null default 0,
        risk_score numeric(10,4) not null default 0,
        capacity_score numeric(10,4) not null default 0,
        continuity_score numeric(10,4) not null default 0,
        governance_state text not null default 'supervised',
        escalation_state text not null default 'controlled',
        recommendation text,
        payload jsonb not null default '{}'::jsonb,
        evidence jsonb not null default '{}'::jsonb,
        correlation_id text,
        source text not null default 'velocity_runtime',
        reviewed_by uuid references profiles(id) on delete set null,
        approved_at timestamptz,
        executed_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $sql$, table_name);

    execute format('alter table %I enable row level security', table_name);
    execute format('drop policy if exists %I on %I', table_name || '_service_role_all', table_name);
    execute format(
      'create policy %I on %I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
      table_name || '_service_role_all',
      table_name
    );

    execute format('create index if not exists %I on %I (tenant_id, created_at desc)', table_name || '_tenant_created_idx', table_name);
    execute format('create index if not exists %I on %I (event_type, status, created_at desc)', table_name || '_event_status_idx', table_name);
    execute format('create index if not exists %I on %I (region_code, market_code, created_at desc)', table_name || '_region_market_idx', table_name);
    execute format('create index if not exists %I on %I using gin (payload)', table_name || '_payload_idx', table_name);

    execute format('drop trigger if exists %I on %I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on %I for each row execute function update_updated_at()',
      table_name || '_touch_updated_at',
      table_name
    );
  end loop;
end $$;

create table if not exists planetary_operations_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  snapshot_type text not null default 'planetary_operations',
  operations_grid_score numeric(10,4) not null default 0,
  workforce_score numeric(10,4) not null default 0,
  continuity_score numeric(10,4) not null default 0,
  resilience_score numeric(10,4) not null default 0,
  emergency_readiness_score numeric(10,4) not null default 0,
  systemic_risk_score numeric(10,4) not null default 0,
  topology jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

alter table planetary_operations_snapshots enable row level security;
drop policy if exists planetary_operations_snapshots_service_role_all on planetary_operations_snapshots;
create policy planetary_operations_snapshots_service_role_all on planetary_operations_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists planetary_operations_snapshots_tenant_created_idx
  on planetary_operations_snapshots (tenant_id, created_at desc);
