import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import { getEnv, hasEnvGroup } from "@/lib/env";

type SupabaseLike = {
  from: (table: string) => {
    insert: (values: Record<string, unknown> | Array<Record<string, unknown>>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export interface NotificationPayload {
  userId: string;
  tenantId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  email?: string | null;
  phone?: string | null;
}

export async function createInAppNotification(
  supabase: SupabaseLike,
  payload: NotificationPayload
) {
  return supabase.from("notifications").insert({
    user_id: payload.userId,
    tenant_id: payload.tenantId,
    channel: "in_app",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    is_read: false,
    sent_at: new Date().toISOString(),
  });
}

export async function sendNotification(supabase: SupabaseLike, payload: NotificationPayload) {
  await createInAppNotification(supabase, payload);

  if (payload.email && hasEnvGroup("email")) {
    sgMail.setApiKey(getEnv("SENDGRID_API_KEY")!);
    await sgMail.send({
      to: payload.email,
      from: "notifications@velocity-field-service.com",
      subject: payload.title,
      text: payload.body,
    });
  }

  if (payload.phone && hasEnvGroup("sms")) {
    const client = twilio(getEnv("TWILIO_ACCOUNT_SID")!, getEnv("TWILIO_AUTH_TOKEN")!);
    await client.messages.create({
      to: payload.phone,
      from: getEnv("TWILIO_PHONE_NUMBER")!,
      body: `${payload.title}: ${payload.body}`,
    });
  }
}
