export interface CRMContact {
  externalId: string;
  email: string;
  name: string;
  phone?: string;
  customerId?: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface CRMSyncResult {
  success: boolean;
  contactId?: string;
  action: "created" | "updated" | "skipped" | "failed";
  error?: string;
}

export interface CRMAdapterConfig {
  provider: "hubspot" | "salesforce" | "generic";
  enabled: boolean;
  syncCustomers: boolean;
  syncProviders: boolean;
  webhookUrl?: string;
}

export const DEFAULT_CRM_CONFIG: CRMAdapterConfig = {
  provider: "generic",
  enabled: false,
  syncCustomers: true,
  syncProviders: false,
};

export function getCRMConfig(): CRMAdapterConfig {
  return DEFAULT_CRM_CONFIG;
}

export async function syncContact(contact: CRMContact): Promise<CRMSyncResult> {
  if (!getCRMConfig().enabled) {
    return {
      success: false,
      action: "skipped",
      error: "CRM integration not enabled",
    };
  }

  console.log("[CRM Sync]", contact.email, getCRMConfig().provider);

  return {
    success: true,
    contactId: `crm-${contact.externalId}`,
    action: "created",
  };
}

export async function handleCRMWebhook(
  payload: Record<string, unknown>
): Promise<{ handled: boolean; action?: string }> {
  console.log("[CRM Webhook] Incoming payload:", JSON.stringify(payload));
  return { handled: false, action: "crm_webhook_not_configured" };
}
