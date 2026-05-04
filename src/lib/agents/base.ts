import Anthropic from "@anthropic-ai/sdk";
import type { AgentName, AgentResponse } from "@/types";
import { createAdminClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface AgentContext {
  jobId?: string;
  userId?: string;
}

export abstract class BaseAgent {
  abstract name: AgentName;
  abstract role: string;
  abstract systemPrompt: string;

  protected client = anthropic;

  async run<T = Record<string, unknown>>(
    userMessage: string,
    context: AgentContext = {}
  ): Promise<AgentResponse<T>> {
    const start = Date.now();
    let tokensUsed = 0;
    let result: AgentResponse<T>;

    try {
      const response = await this.client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: this.systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
      const text = response.content[0].type === "text" ? response.content[0].text : "";

      let parsed: T;
      try {
        const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
          text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text) as T;
      } catch {
        parsed = { raw: text } as unknown as T;
      }

      result = { success: true, data: parsed, tokensUsed, latencyMs: Date.now() - start };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      result = { success: false, error: err, tokensUsed, latencyMs: Date.now() - start };
    }

    await this.log(context, userMessage, result);
    return result;
  }

  private async log(context: AgentContext, input: string, output: AgentResponse) {
    try {
      const supabase = await createAdminClient();
      await supabase.from("agent_logs").insert({
        agent_name: this.name,
        job_id: context.jobId ?? null,
        user_id: context.userId ?? null,
        action: this.role,
        input: { message: input },
        output: output as Record<string, unknown>,
        tokens_used: output.tokensUsed ?? null,
        latency_ms: output.latencyMs ?? null,
        error: output.error ?? null,
      });
    } catch {
      // non-blocking logging
    }
  }
}
