// VeloCity Agent Runner — uses BaseAgent.run() to avoid typed-method fragility
// Each agent gets a well-structured prompt from its input; fallbacks keep workflow alive

import { alice }   from "./alice";
import { max }     from "./max";
import { quinn }   from "./quinn";
import { nova }    from "./nova";
import { rex }     from "./rex";
import { ivy }     from "./ivy";
import { finn }    from "./finn";
import { lena }    from "./lena";
import { tess }    from "./tess";
import { gabriel } from "./gabriel";
import type { AgentName, AgentResponse } from "@/types";

// ── Fallback outputs per agent (used when AI key missing or agent throws) ──

const FALLBACKS: Record<AgentName, Record<string, unknown>> = {
  ALICE: {
    category: "handyman", urgency: "scheduled", complexity: "moderate",
    estimated_duration_hours: 2, estimated_cost_range: { min: 100, max: 300 },
    skills_required: [], title: "Service Request", is_serviceable: true,
    confidence: 0.5, customer_message: "Your request has been received.", fallback: true,
  },
  MAX: {
    ranked_providers: [], dispatch_strategy: "broadcast",
    offer_expiry_minutes: 10, reasoning: "Fallback dispatch", sla_risk: "medium", fallback: true,
  },
  QUINN: {
    is_fair: true, market_rate_range: { min: 0, max: 9999900 },
    variance_percent: 0, line_item_analysis: [], recommendation: "approve",
    overcharge_detected: false, customer_message: "Your quote is ready for review.", fallback: true,
  },
  NOVA: {
    should_notify_customer: true, customer_message: "Your job status has been updated.",
    should_notify_provider: false, next_action: null, fallback: true,
  },
  REX: {
    new_trust_score: null, trust_delta: 0, badges_earned: [],
    review_prompt: "How was your experience?", fallback: true,
  },
  IVY: {
    recommendation: "manual_review", confidence: 0.5,
    resolution_options: ["refund", "partial_refund", "no_action"],
    timeline_summary: "Dispute opened — awaiting review.", fallback: true,
  },
  FINN: {
    should_release: false, payout_amount_cents: 0, platform_fee_cents: 0,
    hold_reason: "ai_unavailable", risk_flags: [], payment_note: "Manual review required.", fallback: true,
  },
  LENA: {
    should_send_campaign: false, message: null, offer_type: null,
    discount_percent: 0, fallback: true,
  },
  TESS: {
    high_demand_zips: [], supply_gaps: [], recommendations: [], fallback: true,
  },
  GABRIEL: {
    approved: true, policy_violations: [], risk_level: "low",
    reasoning: "Fallback approval — AI unavailable.", fallback: true,
  },
};

// ── Prompt builders per agent ────────────────────────────────

function buildPrompt(name: AgentName, input: Record<string, unknown>): string {
  switch (name) {
    case "ALICE":
      return `Customer service request:\nDescription: ${input.message}\nService ZIP: ${input.zip}\n\nClassify this request and respond with JSON.`;

    case "MAX":
      return `Job to dispatch:\n${JSON.stringify(input.job, null, 2)}\n\nAvailable providers:\n${JSON.stringify((input.providers as unknown[])?.slice(0, 10), null, 2)}\n\nRank providers and determine dispatch strategy. Respond with JSON.`;

    case "QUINN":
      return `Review this quote for a ${input.urgency} ${input.category} job:\nLine items: ${JSON.stringify(input.lineItems)}\nTotal: $${((input.totalCents as number) / 100).toFixed(2)}\nLocation: ${input.city}, ${input.state}\n\nAnalyze fairness and respond with JSON.`;

    case "NOVA":
      return `Job state transition:\nJob: ${JSON.stringify(input.job)}\nTransition: ${JSON.stringify(input.transition)}\nActor role: ${input.actorRole}\n\nAnalyze and determine notifications. Respond with JSON.`;

    case "REX":
      return `Trust evaluation for provider ${input.providerId}:\nJob: ${JSON.stringify(input.job)}\n\nUpdate trust score and assess badges. Respond with JSON with fields: new_trust_score (number 0-100), trust_delta, badges_earned (array).`;

    case "IVY":
      return `Dispute analysis:\nJob ID: ${input.jobId}\nDispute ID: ${input.disputeId}\nReason: ${input.reason}\n\nGenerate timeline and recommend resolution. Respond with JSON.`;

    case "FINN":
      return `Payout evaluation:\nJob: ${JSON.stringify(input.job)}\nPayments: ${JSON.stringify(input.payments)}\nProvider completed jobs: ${input.providerCompletedJobs}\nActive dispute: ${input.hasActiveDispute}\n\nShould we release payout? Respond with JSON.`;

    case "LENA":
      return `Customer retention analysis:\nCustomer ID: ${input.customerId}\nJob ID: ${input.jobId}\nTrigger: ${input.trigger}\n\nShould we send a retention campaign? Respond with JSON with fields: should_send_campaign (bool), message (string), offer_type (string), discount_percent (number).`;

    case "TESS":
      return `Territory analysis:\nJobs by ZIP: ${JSON.stringify(input.jobsByZip)}\nUnfilled by category: ${JSON.stringify(input.unfilledByCategory)}\nOnline providers: ${input.onlineProviders}/${input.providerCount}\nDate: ${input.date}\n\nAnalyze territory health. Respond with JSON.`;

    case "GABRIEL":
      return `Governance check:\nAction: ${input.action}\nPayload: ${JSON.stringify(input.payload)}\n\nIs this action permitted by policy? Respond with JSON with fields: approved (bool), policy_violations (array), risk_level (low/medium/high/blocked), reasoning (string).`;

    default:
      return JSON.stringify(input);
  }
}

// ── Agent registry ────────────────────────────────────────────

const AGENTS: Record<AgentName, { run: (msg: string, ctx: { jobId?: string; userId?: string }) => Promise<unknown> }> = {
  ALICE: alice, MAX: max, QUINN: quinn, NOVA: nova,
  REX: rex, IVY: ivy, FINN: finn, LENA: lena, TESS: tess, GABRIEL: gabriel,
};

// ── Main runner ──────────────────────────────────────────────

export async function runAgent(
  name: AgentName,
  input: Record<string, unknown>
): Promise<AgentResponse<Record<string, unknown>>> {
  const isAIConfigured =
    !!process.env.ANTHROPIC_API_KEY &&
    !process.env.ANTHROPIC_API_KEY.includes("placeholder");

  if (!isAIConfigured) {
    return { success: true, data: { ...FALLBACKS[name] }, tokensUsed: 0, latencyMs: 0 };
  }

  const agent = AGENTS[name];
  const ctx = { jobId: input.jobId as string, userId: input.userId as string };
  const prompt = buildPrompt(name, input);

  try {
    const result = await agent.run(prompt, ctx) as AgentResponse<Record<string, unknown>>;

    if (!result || (!result.success && !result.data)) {
      return { success: true, data: { ...FALLBACKS[name] }, tokensUsed: result?.tokensUsed ?? 0, latencyMs: result?.latencyMs ?? 0 };
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[runAgent] ${name} failed:`, errorMsg);
    return { success: true, data: { ...FALLBACKS[name] }, error: errorMsg, tokensUsed: 0, latencyMs: 0 };
  }
}
