// Handler: membership_created / membership_renewed / membership_expiring /
// membership_cancelled / renewal_failed → connects ALICE (retention),
// FINN (revenue), and NOVA (growth) to the membership lifecycle, per Phase
// 8's "no new automation engine" rule. Reuses the existing router/queue —
// this file is just another EventHandler, same shape as every other
// handler in this directory.

import { getAdminClient } from "@/lib/supabase/admin";
import { alice } from "@/lib/agents/alice";
import { nova } from "@/lib/agents/nova";
import type { AutomationPayload, AutomationQueueItem, HandlerResult } from "@/types/automation";

export async function handleMembershipLifecycle(
  rawPayload: AutomationPayload,
  item: AutomationQueueItem
): Promise<HandlerResult> {
  const payload = rawPayload as Record<string, unknown>;
  const { membership_subscription_id, customer_id, tenant_id } = payload;
  const db = getAdminClient();

  if (!membership_subscription_id || typeof membership_subscription_id !== "string") {
    return { success: true, output: { skipped: "no membership_subscription_id" } };
  }
  if (!tenant_id || typeof tenant_id !== "string") {
    return { success: true, output: { skipped: "no tenant_id on payload" } };
  }

  if (item.event_type === "membership_cancelled" || item.event_type === "renewal_failed") {
    const retention = await alice.assessMembershipRetention(tenant_id);
    const relevant = retention.retentionWorkflows.filter((w) => w.subscriptionId === membership_subscription_id);
    for (const action of relevant) {
      await db.from("notifications").insert({
        user_id: action.customerId,
        type: "retention",
        title: item.event_type === "renewal_failed" ? "We couldn't process your membership renewal" : "We're sorry to see you go",
        body: action.reason,
        channel: "in_app",
        metadata: { membership_subscription_id, automation_action: action.action },
      });
    }
    return { success: true, output: { event: item.event_type, workflows_triggered: relevant.length } };
  }

  if (item.event_type === "membership_expiring") {
    if (typeof customer_id === "string") {
      const growth = await nova.recommendMembershipGrowth(customer_id, tenant_id);
      await db.from("notifications").insert({
        user_id: customer_id,
        type: "retention",
        title: "Your VeloCity membership renews soon",
        body: "Review your upcoming renewal and see if a plan upgrade fits your recent service history.",
        channel: "in_app",
        metadata: { membership_subscription_id, plan_upgrade_opportunities: growth.planUpgradeOpportunities.length },
      });
    }
    return { success: true, output: { event: "membership_expiring" } };
  }

  if (item.event_type === "membership_created" && typeof customer_id === "string") {
    await db.from("notifications").insert({
      user_id: customer_id,
      type: "retention",
      title: "Welcome to your VeloCity membership",
      body: "Your membership is active. Check your dashboard for included benefits and upcoming services.",
      channel: "in_app",
      metadata: { membership_subscription_id },
    });
    return { success: true, output: { event: "membership_created" } };
  }

  return { success: true, output: { event: item.event_type, handled: false } };
}
