export interface EcosystemConnector {
  id: string
  name: string
  connectorType: "webhook" | "api" | "event_stream" | "batch_sync" | "realtime"
  targetSystem: string
  status: "active" | "degraded" | "inactive"
  authType: "api_key" | "oauth" | "webhook_secret" | "mutual_tls"
  rateLimitPerMin: number
  callsThisMinute: number
  lastCalledAt?: string
  registeredAt: string
}

const CONNECTORS: Map<string, EcosystemConnector> = new Map()
const CAP = 100

function makeConnector(
  id: string,
  name: string,
  connectorType: EcosystemConnector["connectorType"],
  targetSystem: string,
  authType: EcosystemConnector["authType"],
  rateLimitPerMin: number
): EcosystemConnector {
  return {
    id,
    name,
    connectorType,
    targetSystem,
    status: "active",
    authType,
    rateLimitPerMin,
    callsThisMinute: 0,
    registeredAt: new Date().toISOString(),
  }
}

CONNECTORS.set("stripe-webhook", makeConnector("stripe-webhook", "Stripe Webhook", "webhook", "stripe.com", "webhook_secret", 120))
CONNECTORS.set("sendgrid-api", makeConnector("sendgrid-api", "SendGrid API", "api", "sendgrid.com", "api_key", 600))
CONNECTORS.set("twilio-sms", makeConnector("twilio-sms", "Twilio SMS", "api", "twilio.com", "api_key", 100))

export function registerConnector(
  id: string,
  name: string,
  connectorType: EcosystemConnector["connectorType"],
  targetSystem: string,
  authType: EcosystemConnector["authType"],
  rateLimitPerMin: number
): EcosystemConnector {
  if (CONNECTORS.size >= CAP) {
    const firstKey = Array.from(CONNECTORS.keys())[0]
    if (firstKey !== undefined) CONNECTORS.delete(firstKey)
  }
  const connector = makeConnector(id, name, connectorType, targetSystem, authType, rateLimitPerMin)
  CONNECTORS.set(id, connector)
  return connector
}

export function recordCall(id: string): { allowed: boolean; reason?: string } {
  const connector = CONNECTORS.get(id)
  if (!connector) return { allowed: false, reason: "Connector not found" }
  if (connector.callsThisMinute >= connector.rateLimitPerMin) {
    return { allowed: false, reason: "Rate limit exceeded" }
  }
  connector.callsThisMinute++
  connector.lastCalledAt = new Date().toISOString()
  return { allowed: true }
}

export function updateConnectorStatus(id: string, status: EcosystemConnector["status"]): void {
  const connector = CONNECTORS.get(id)
  if (connector) connector.status = status
}

export function getActiveConnectors(): EcosystemConnector[] {
  return Array.from(CONNECTORS.values()).filter(c => c.status === "active")
}

export function getRateLimitedConnectors(): EcosystemConnector[] {
  return Array.from(CONNECTORS.values()).filter(c => c.callsThisMinute >= c.rateLimitPerMin)
}
