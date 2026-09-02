// Handler: operator_approved / franchise_royalty_due / territory_activated
// Franchise lifecycle events — triggered when an operator is approved,
// a territory goes live, or a royalty payment cycle is due.

import { getAdminClient } from "@/lib/supabase/admin";
import type { AutomationPayload, AutomationQueueItem, HandlerResult } from "@/types/automation";

export async function handleFranchiseLifecycle(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as Record<string, unknown>;
  const db = getAdminClient();

  const territory_id = typeof payload.territory_id === "string" ? payload.territory_id : null;
  const operator_id = typeof payload.operator_id === "string" ? payload.operator_id : null;
  const tenant_id = typeof payload.tenant_id === "string" ? payload.tenant_id : null;

  if (!tenant_id) return { success: true, output: { skipped: "no tenant_id" } };

  if (item.event_type === "operator_approved") {
    // Promote territory_operators row from candidate → approved
    if (operator_id) {
      const { error } = await db
        .from("territory_operators")
        .update({ status: "approved" })
        .eq("id", operator_id)
        .eq("tenant_id", tenant_id);

      if (error) return { success: false, error: error.message };

      await db.from("audit_logs").insert({
        action: "franchise_operator_approved",
        actor_id: null,
        entity_type: "territory_operator",
        entity_id: operator_id,
        metadata: { territory_id, tenant_id },
      });
    }

    return { success: true, output: { operator_id, event: "operator_approved" } };
  }

  if (item.event_type === "territory_activated") {
    // Mark territory as active
    if (territory_id) {
      const { error } = await db
        .from("franchise_territories")
        .update({ status: "active" })
        .eq("id", territory_id)
        .eq("tenant_id", tenant_id);

      if (error) return { success: false, error: error.message };

      await db.from("audit_logs").insert({
        action: "franchise_territory_activated",
        actor_id: null,
        entity_type: "franchise_territory",
        entity_id: territory_id,
        metadata: { tenant_id },
      });
    }

    return { success: true, output: { territory_id, event: "territory_activated" } };
  }

  if (item.event_type === "franchise_royalty_due") {
    // Compute unsettled royalties for this territory and mark them settled.
    // In production, this would trigger a Stripe transfer — here it marks
    // revenue_records.settled = true and writes a governance audit log.
    if (territory_id) {
      const { data: unsettled } = await db
        .from("revenue_records")
        .select("id, franchise_royalty_cents, franchise_owner_id")
        .eq("franchise_territory_id", territory_id)
        .eq("settled", false)
        .eq("tenant_id", tenant_id)
        .limit(100);

      const rows = unsettled ?? [];
      const totalRoyaltyCents = rows.reduce((s, r) => s + (r.franchise_royalty_cents ?? 0), 0);

      if (rows.length > 0) {
        await db
          .from("revenue_records")
          .update({ settled: true, settled_at: new Date().toISOString() })
          .in("id", rows.map((r) => r.id));
      }

      const franchiseOwnerId = rows[0]?.franchise_owner_id ?? null;

      await db.from("audit_logs").insert({
        action: "franchise_royalty_settled",
        actor_id: null,
        entity_type: "franchise_territory",
        entity_id: territory_id,
        metadata: {
          tenant_id,
          franchise_owner_id: franchiseOwnerId,
          records_settled: rows.length,
          total_royalty_cents: totalRoyaltyCents,
        },
      });

      return {
        success: true,
        output: { territory_id, records_settled: rows.length, total_royalty_cents: totalRoyaltyCents },
      };
    }

    return { success: true, output: { skipped: "no territory_id for royalty_due" } };
  }

  return { success: true, output: { skipped: `unhandled franchise event: ${item.event_type}` } };
}
