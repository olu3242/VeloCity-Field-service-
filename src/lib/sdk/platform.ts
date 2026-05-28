export type VelocitySdkOptions = {
  baseUrl: string;
  apiKey: string;
};

export type VelocityEventPayload = {
  event_type: string;
  payload?: Record<string, unknown>;
  dedup_key?: string;
};

export class VelocityPlatformSDK {
  constructor(private readonly options: VelocitySdkOptions) {}

  async emitEvent(input: VelocityEventPayload) {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/api/platform/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(input),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error ?? `Velocity API error ${response.status}`);
    }
    return body;
  }
}
