// POST /api/cron/predictive — Daily predictive intelligence sweep.
// Reads retention/risk data from existing intelligence functions and emits
// predictive signal events (churn risk, renewal due, provider at risk).
// Runs daily via vercel.json cron schedule.

import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { emitEvent } from "@/lib/automation/emitEvent";
import { createAdminClient } from "@/lib/supabase/server";
import { computeMembershipRetentionIntelligence } from "@/lib/membership/membershipRetentionIntelligence";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";

export async function GET(request: NextRequest) {
  return runPredictiveSweep(request);
}

export async function POST(request: NextRequest) {
  return runPredictiveSweep(request);
}

async function runPredictiveSweep(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const supabase = await createAdminClient();
  const tenantId = DEFAULT_TENANT_ID;
  const day = new Date().toISOString().slice(0, 10);
  const emitted: string[] = [];
  const errors: string[] = [];

  // 1. Membership renewal due signals (next 7 days)
  try {
    const retention = await computeMembershipRetentionIntelligence(tenantId);
    const urgentRenewals = retention.upcomingRenewals.filter((r) => r.daysUntilRenewal <= 7);
    for (const renewal of urgentRenewals) {
      await emitEvent(supabase, {
        type: "membership_renewal_due",
        source: "cron.predictive",
        entityType: "membership_subscription",
        entityId: renewal.subscriptionId,
        tenantId,
        dedupKey: `membership_renewal_due:${renewal.subscriptionId}:${day}`,
        payload: {
          tenant_id: tenantId,
          subscription_id: renewal.subscriptionId,
          customer_id: renewal.customerId,
          plan_name: renewal.planName,
          days_until_renewal: renewal.daysUntilRenewal,
          current_period_end: renewal.currentPeriodEnd,
        },
      });
      emitted.push(`membership_renewal_due:${renewal.subscriptionId}`);
    }

    // 2. At-risk member churn signals
    for (const atRisk of retention.atRiskMembers.slice(0, 20)) {
      if (atRisk.churnRiskLevel === "high") {
        await emitEvent(supabase, {
          type: "customer_churn_risk_detected",
          source: "cron.predictive",
          entityType: "membership_subscription",
          entityId: atRisk.subscriptionId,
          tenantId,
          dedupKey: `customer_churn_risk_detected:${atRisk.customerId}:${day}`,
          payload: {
            tenant_id: tenantId,
            customer_id: atRisk.customerId,
            subscription_id: atRisk.subscriptionId,
            churn_risk_score: atRisk.churnRiskScore,
            reason: atRisk.reason,
          },
        });
        emitted.push(`customer_churn_risk_detected:${atRisk.customerId}`);
      }
    }
  } catch (err) {
    errors.push(`retention: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Provider at-risk signals (high cancellation rate or low trust score)
  try {
    const { data: atRiskProviders } = await supabase
      .from("providers")
      .select("id, trust_score, cancellation_rate")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .or("cancellation_rate.gte.0.15,trust_score.lt.40")
      .limit(20);

    for (const provider of atRiskProviders ?? []) {
      const reasons: string[] = [];
      if ((provider.cancellation_rate ?? 0) >= 0.15) {
        reasons.push(`cancellation rate ${Math.round(provider.cancellation_rate * 100)}%`);
      }
      if ((provider.trust_score ?? 100) < 40) {
        reasons.push(`trust score ${provider.trust_score}`);
      }
      await emitEvent(supabase, {
        type: "provider_at_risk_detected",
        source: "cron.predictive",
        entityType: "provider",
        entityId: provider.id,
        tenantId,
        dedupKey: `provider_at_risk_detected:${provider.id}:${day}`,
        payload: {
          tenant_id: tenantId,
          provider_id: provider.id,
          trust_score: provider.trust_score,
          cancellation_rate: provider.cancellation_rate,
          risk_reason: reasons.join("; "),
        },
      });
      emitted.push(`provider_at_risk_detected:${provider.id}`);
    }
  } catch (err) {
    errors.push(`providers: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    ok: true,
    day,
    emitted: emitted.length,
    events: emitted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
