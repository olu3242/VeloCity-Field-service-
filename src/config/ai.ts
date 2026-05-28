import { aiAgentPages } from "@/config/marketplace";

export const aiConfig = {
  agents: aiAgentPages,
  dispatchEventTypes: [
    "service_request_created",
    "serviceability_passed",
    "provider_offer_sent",
    "quote_submitted",
    "job_completed",
  ],
  defaultAgentRoute: "/ai/alice",
} as const;
