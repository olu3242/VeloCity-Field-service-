import { env } from "@/config/env";
import { velocityBrand } from "@/config/brand";

export const appConfig = {
  name: velocityBrand.productName,
  shortName: velocityBrand.name,
  url: env.appUrl,
  apiBaseUrl: env.apiBaseUrl,
  websocketUrl: env.appUrl.replace(/^http/, "ws"),
  supportEmail: "support@velocity.local",
  defaultPort: 3003,
  featureFlags: {
    realtime: env.supabase.enabled,
    payments: env.stripe.enabled,
    aiAgents: env.ai.enabled,
    developmentFallbacks: env.isDevelopment,
  },
} as const;
