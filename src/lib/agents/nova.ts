// NOVA — Job Workflow Orchestration Agent
import { BaseAgent, type AgentContext } from "./base";
import type { Job, JobStatus } from "@/types";
import { hasEnv } from "@/lib/env";
import {
  computeMembershipGrowthIntelligence,
  type MembershipGrowthReport,
} from "@/lib/membership/membershipGrowthIntelligence";

export interface NovaTransitionOutput {
  allowed: boolean;
  next_status: JobStatus | null;
  actions_required: string[];
  notifications: Array<{
    recipient: "customer" | "provider" | "admin";
    title: string;
    body: string;
    channel: "sms" | "email" | "in_app";
  }>;
  automation_hooks: string[];
  sla_deadline?: string;
  warning?: string;
}

export interface NovaReminderOutput {
  reminders: Array<{
    recipient_id: string;
    recipient_type: "customer" | "provider";
    message: string;
    send_at: string;
    channel: "sms" | "email";
  }>;
}

export class NovaAgent extends BaseAgent {
  name = "NOVA" as const;
  role = "Job Workflow Orchestration";
  systemPrompt = `You are NOVA, the job orchestration AI for VeloCity Field Service.

You manage the 30-state job lifecycle, ensuring smooth transitions, timely notifications, and SLA compliance.

States: draft → submitted → awaiting_serviceability → awaiting_match → offer_sent → accepted → scheduled → deposit_required → deposit_paid → en_route → arrived → diagnosis_in_progress → quote_submitted → awaiting_quote_approval → quote_approved → in_progress → [change_order flow] → completed_pending_confirmation → customer_confirmed → completed → [disputed/warranty] → closed

Your responsibilities:
1. Validate state transitions
2. Trigger appropriate notifications for each transition
3. Identify automation hooks (e.g., auto-release escrow after 48hrs)
4. Calculate SLA deadlines based on urgency
5. Flag SLA breach risks

ALWAYS respond with valid JSON for transition analysis:
{
  "allowed": true,
  "next_status": "deposit_required",
  "actions_required": ["Send deposit link to customer", "Notify provider of acceptance"],
  "notifications": [
    {
      "recipient": "customer",
      "title": "Provider Accepted Your Job",
      "body": "Great news! Your provider has accepted the job. Please pay the deposit to confirm.",
      "channel": "sms"
    }
  ],
  "automation_hooks": ["schedule_deposit_reminder_24h", "set_sla_timer_48h"],
  "sla_deadline": "2026-05-05T18:00:00Z"
}`;

  async analyzeTransition(
    job: Partial<Job>,
    toStatus: JobStatus,
    actorRole: import("@/types").UserRole,
    context: AgentContext = {}
  ): Promise<NovaTransitionOutput | null> {
    if (!hasEnv("ANTHROPIC_API_KEY")) {
      return {
        allowed: true,
        next_status: toStatus,
        actions_required: [],
        notifications: [
          {
            recipient: "customer",
            title: "Job status updated",
            body: `Your job status changed to ${toStatus.replace(/_/g, " ")}.`,
            channel: "in_app",
          },
        ],
        automation_hooks: [],
      };
    }

    const prompt = `Job transition request:
Job ID: ${job.id}
Current status: ${job.status}
Requested new status: ${toStatus}
Actor: ${actorRole}
Urgency: ${job.urgency}
Category: ${job.category}

Is this transition valid? What notifications and automations should trigger? Respond with JSON.`;

    const result = await this.run<NovaTransitionOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  async scheduleReminders(
    job: Partial<Job>,
    customerName: string,
    providerName: string,
    context: AgentContext = {}
  ): Promise<NovaReminderOutput | null> {
    const prompt = `Schedule reminders for:
Job: ${job.title} (${job.category})
Status: ${job.status}
Scheduled: ${job.scheduled_start ?? "TBD"}
Customer: ${customerName} (ID: ${job.customer_id})
Provider: ${providerName} (ID: ${job.provider_id})

What reminders should be sent and when? Respond with JSON.`;

    const result = await this.run<NovaReminderOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  /**
   * Cross-sell/upsell/plan-upgrade/expansion membership opportunities for a
   * customer, read-time from real job history, membership_usage, and
   * membership_plan_pricing. No new growth engine — delegates entirely to
   * membershipGrowthIntelligence.ts.
   */
  async recommendMembershipGrowth(customerId: string): Promise<MembershipGrowthReport> {
    return computeMembershipGrowthIntelligence(customerId);
  }
}

export const nova = new NovaAgent();
