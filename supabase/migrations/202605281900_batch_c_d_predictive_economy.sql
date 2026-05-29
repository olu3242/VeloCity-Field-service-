-- Batch C/D: predictive operations, national optimization, and ecosystem economy foundations.
-- Additive only. These tables are service-role governed and consumed through audited admin APIs.

do $$
declare
  table_name text;
  intelligence_tables text[] := array[
    'predictive_operational_insights',
    'operational_forecasts',
    'territory_risk_models',
    'enterprise_risk_models',
    'autonomous_dispatch_models',
    'dispatch_optimization_scores',
    'provider_load_balancing_models',
    'national_workforce_metrics',
    'provider_capacity_forecasts',
    'territory_workforce_health',
    'territory_margin_models',
    'financial_risk_models',
    'profitability_forecasts',
    'reserve_forecasts',
    'enterprise_operational_forecasts',
    'enterprise_capacity_models',
    'enterprise_sla_risk_models',
    'territory_optimization_cycles',
    'territory_efficiency_models',
    'territory_improvement_recommendations',
    'escalation_prediction_models',
    'escalation_resolution_models',
    'executive_escalation_intelligence',
    'operational_recommendations',
    'recommendation_execution_logs',
    'territory_recommendation_adoption',
    'national_risk_models',
    'operational_risk_events',
    'territory_risk_heatmaps',
    'ecosystem_partners',
    'partner_integrations',
    'partner_operational_profiles',
    'ecosystem_relationships',
    'national_provider_marketplace',
    'provider_mobility_profiles',
    'territory_workforce_exchange',
    'cross_market_provider_assignments',
    'provider_financial_profiles',
    'territory_financial_services',
    'embedded_financial_products',
    'provider_capital_programs',
    'api_clients',
    'partner_api_permissions',
    'operational_api_usage',
    'integration_event_logs',
    'service_verticals',
    'vertical_operational_models',
    'vertical_sla_profiles',
    'vertical_market_metrics',
    'territory_economic_models',
    'market_liquidity_scores',
    'territory_growth_forecasts',
    'territory_revenue_heatmaps',
    'infrastructure_products',
    'platform_usage_billing',
    'operational_subscription_plans',
    'infrastructure_usage_metrics',
    'enterprise_partner_networks',
    'enterprise_vendor_relationships',
    'enterprise_multi_operator_models',
    'national_partner_programs',
    'partner_performance_metrics',
    'strategic_relationships',
    'infrastructure_exchange',
    'territory_resource_marketplace',
    'provider_capacity_exchange',
    'operational_resource_auctions'
  ];
begin
  foreach table_name in array intelligence_tables loop
    execute format($sql$
      create table if not exists %I (
        id uuid primary key default gen_random_uuid(),
        tenant_id uuid references tenants(id) on delete cascade,
        territory_id uuid references franchise_territories(id) on delete set null,
        provider_id uuid references providers(id) on delete set null,
        partner_id uuid,
        subject_type text not null default 'platform',
        subject_id uuid,
        model_type text not null default 'operational',
        status text not null default 'active',
        severity text not null default 'info',
        score numeric(10,4) not null default 0,
        confidence numeric(5,4) not null default 0,
        forecast_window text,
        recommendation text,
        governance_state text not null default 'supervised',
        payload jsonb not null default '{}'::jsonb,
        evidence jsonb not null default '{}'::jsonb,
        correlation_id text,
        source text not null default 'velocity_runtime',
        reviewed_by uuid references profiles(id) on delete set null,
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
    execute format('create index if not exists %I on %I (status, severity, created_at desc)', table_name || '_status_severity_idx', table_name);
    execute format('create index if not exists %I on %I (territory_id, provider_id)', table_name || '_territory_provider_idx', table_name);
    execute format('create index if not exists %I on %I using gin (payload)', table_name || '_payload_idx', table_name);

    execute format('drop trigger if exists %I on %I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on %I for each row execute function update_updated_at()',
      table_name || '_touch_updated_at',
      table_name
    );
  end loop;
end $$;

create table if not exists executive_operations_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  snapshot_type text not null default 'national_operations',
  health_score numeric(10,4) not null default 0,
  risk_score numeric(10,4) not null default 0,
  profitability_score numeric(10,4) not null default 0,
  workforce_score numeric(10,4) not null default 0,
  ecosystem_score numeric(10,4) not null default 0,
  summary jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

alter table executive_operations_snapshots enable row level security;
drop policy if exists executive_operations_snapshots_service_role_all on executive_operations_snapshots;
create policy executive_operations_snapshots_service_role_all on executive_operations_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists executive_operations_snapshots_tenant_created_idx
  on executive_operations_snapshots (tenant_id, created_at desc);
