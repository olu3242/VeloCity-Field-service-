-- Franchise OS Phase 1: Add RLS policies so franchise owners can read their
-- own territory data using the auth-scoped client.
--
-- The existing policies on these tables are admin-only (app.is_tenant_admin).
-- These additive SELECT policies enable the /franchise/* pages to work
-- without needing the service-role bypass.

-- ── territory_operators: franchise owner sees own operator rows ────────────
CREATE POLICY "franchise_owner_view_own_operator_row"
  ON territory_operators
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ── franchise_territories: franchise owner sees territories they operate ───
CREATE POLICY "franchise_owner_view_own_territories"
  ON franchise_territories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM territory_operators
      WHERE territory_operators.territory_id = franchise_territories.id
        AND territory_operators.profile_id = auth.uid()
    )
  );

-- ── territory_scorecards: franchise owner sees scorecards for own territories
CREATE POLICY "franchise_owner_view_own_territory_scorecards"
  ON territory_scorecards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM territory_operators
      WHERE territory_operators.territory_id = territory_scorecards.territory_id
        AND territory_operators.profile_id = auth.uid()
    )
  );

-- ── expansion_recommendations: franchise owner sees recs for own territories
CREATE POLICY "franchise_owner_view_own_expansion_recommendations"
  ON expansion_recommendations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM territory_operators
      WHERE territory_operators.territory_id = expansion_recommendations.territory_id
        AND territory_operators.profile_id = auth.uid()
    )
  );

-- ── local_market_snapshots: franchise owner sees snapshots for own territories
CREATE POLICY "franchise_owner_view_own_market_snapshots"
  ON local_market_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM territory_operators
      WHERE territory_operators.territory_id = local_market_snapshots.territory_id
        AND territory_operators.profile_id = auth.uid()
    )
  );
