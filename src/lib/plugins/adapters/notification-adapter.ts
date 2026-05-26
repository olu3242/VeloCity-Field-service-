export interface NotificationRequest {
  channel: "email" | "sms" | "push" | "in_app" | "slack";
  recipient: { userId?: string; email?: string; phone?: string };
  template: string;
  data: Record<string, unknown>;
  tenantId: string;
  priority: "low" | "medium" | "high" | "critical";
}

export interface NotificationResult {
  sent: boolean;
  channel: string;
  provider?: string;
  error?: string;
}

export async function routeNotification(
  request: NotificationRequest
): Promise<NotificationResult> {
  switch (request.channel) {
    case "in_app": {
      const { getAdminClient } = await import("@/lib/supabase/admin");
      const supabase = getAdminClient();
      await supabase.from("notifications").insert({
        user_id: request.recipient.userId ?? null,
        tenant_id: request.tenantId,
        type: request.template,
        title: request.template,
        message: JSON.stringify(request.data),
        is_read: false,
      });
      return { sent: true, channel: "in_app", provider: "supabase" };
    }

    case "email":
      console.log("[Email intent]", request.recipient.email, request.template);
      return {
        sent: false,
        channel: "email",
        provider: "sendgrid_pending",
        error: "SendGrid not yet configured",
      };

    case "sms":
      console.log("[SMS intent]");
      return {
        sent: false,
        channel: "sms",
        provider: "twilio_pending",
        error: "Twilio not yet configured",
      };

    case "slack":
      console.log("[Slack intent]");
      return {
        sent: false,
        channel: "slack",
        provider: "slack_pending",
        error: "Slack not yet configured",
      };

    case "push":
      console.log("[Push intent]");
      return {
        sent: false,
        channel: "push",
        provider: "fcm_pending",
        error: "FCM not yet configured",
      };
  }
}
