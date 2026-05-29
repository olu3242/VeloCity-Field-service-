-- Batch E/F: autonomous infrastructure cloud, national service grid, and global infrastructure intelligence OS.
-- Additive only. Central governance, service-role execution, and supervised AI payloads only.

do $$
declare
  table_name text;
  infra_tables text[] := array[
    'infrastructure_runtime_clusters',
    'operational_compute_regions',
    'runtime_resource_allocations',
    'infrastructure_scaling_events',
    'national_service_grid',
    'grid_capacity_models',
    'territory_grid_relationships',
    'service_grid_balancing',
    'ai_operations_exchange',
    'operational_resource_bids',
    'territory_capacity_markets',
    'dynamic_resource_pricing',
    'national_workforce_liquidity',
    'provider_liquidity_scores',
    'territory_workforce_flows',
    'cross_market_workforce_optimization',
    'resource_allocation_models',
    'territory_resource_constraints',
    'operational_capacity_forecasts',
    'resource_utilization_heatmaps',
    'territory_economic_forecasts',
    'national_liquidity_models',
    'operational_market_models',
    'service_economy_metrics',
    'iaas_clients',
    'infrastructure_service_plans',
    'runtime_usage_metrics',
    'service_consumption_models',
    'territory_federation_relationships',
    'federated_operational_rules',
    'cross_territory_governance',
    'federated_routing_models',
    'ai_routing_models',
    'national_routing_predictions',
    'routing_optimization_cycles',
    'autonomous_routing_decisions',
    'national_operations_fabric',
    'fabric_operational_links',
    'operational_dependency_graphs',
    'fabric_health_metrics',
    'global_territory_federations',
    'international_operational_regions',
    'cross_border_operational_rules',
    'federated_global_relationships',
    'global_service_economy',
    'international_liquidity_models',
    'cross_market_service_flows',
    'service_economy_balancing',
    'governance_ai_models',
    'operational_policy_predictions',
    'compliance_risk_models',
    'governance_recommendations',
    'global_workforce_network',
    'international_provider_profiles',
    'cross_border_workforce_flows',
    'workforce_mobility_models',
    'international_territories',
    'regional_compliance_models',
    'currency_orchestration',
    'localized_operational_rules',
    'infrastructure_diplomacy_models',
    'cross_territory_negotiations',
    'operational_conflict_resolution',
    'ecosystem_relationship_intelligence',
    'global_liquidity_networks',
    'cross_market_liquidity_flows',
    'international_capacity_exchanges',
    'global_resource_balancing',
    'autonomous_compliance_models',
    'international_policy_engines',
    'regulatory_risk_models',
    'global_compliance_events',
    'infrastructure_intelligence_core',
    'global_operational_graphs',
    'infrastructure_dependency_models',
    'systemic_risk_models',
    'global_governance_fabric',
    'federated_governance_relationships',
    'international_operational_policies',
    'global_escalation_networks'
  ];
begin
  foreach table_name in array infra_tables loop
    execute format($sql$
      create table if not exists %I (
        id uuid primary key default gen_random_uuid(),
        tenant_id uuid references tenants(id) on delete cascade,
        territory_id uuid references franchise_territories(id) on delete set null,
        provider_id uuid references providers(id) on delete set null,
        partner_id uuid,
        region_code text,
        market_code text,
        subject_type text not null default 'infrastructure',
        subject_id uuid,
        model_type text not null default 'operations_fabric',
        status text not null default 'active',
        severity text not null default 'info',
        score numeric(10,4) not null default 0,
        confidence numeric(5,4) not null default 0,
        capacity_score numeric(10,4) not null default 0,
        liquidity_score numeric(10,4) not null default 0,
        governance_state text not null default 'supervised',
        sla_state text not null default 'governed',
        recommendation text,
        payload jsonb not null default '{}'::jsonb,
        evidence jsonb not null default '{}'::jsonb,
        correlation_id text,
        source text not null default 'velocity_infrastructure_os',
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
    execute format('create index if not exists %I on %I (region_code, market_code, created_at desc)', table_name || '_region_market_idx', table_name);
    execute format('create index if not exists %I on %I (status, severity, created_at desc)', table_name || '_status_severity_idx', table_name);
    execute format('create index if not exists %I on %I using gin (payload)', table_name || '_payload_idx', table_name);

    execute format('drop trigger if exists %I on %I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on %I for each row execute function update_updated_at()',
      table_name || '_touch_updated_at',
      table_name
    );
  end loop;
end $$;

create table if not exists infrastructure_os_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  snapshot_type text not null default 'global_infrastructure_os',
  infrastructure_score numeric(10,4) not null default 0,
  service_grid_score numeric(10,4) not null default 0,
  liquidity_score numeric(10,4) not null default 0,
  governance_score numeric(10,4) not null default 0,
  systemic_risk_score numeric(10,4) not null default 0,
  topology jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

alter table infrastructure_os_snapshots enable row level security;
drop policy if exists infrastructure_os_snapshots_service_role_all on infrastructure_os_snapshots;
create policy infrastructure_os_snapshots_service_role_all on infrastructure_os_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists infrastructure_os_snapshots_tenant_created_idx
  on infrastructure_os_snapshots (tenant_id, created_at desc);
