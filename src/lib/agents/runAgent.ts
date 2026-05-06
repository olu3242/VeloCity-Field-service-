import type { AgentResponse } from "@/types";
import type { AgentName } from "@/types";
import type { AgentContext, BaseAgent } from "./base";
import { alice } from "./alice";
import { finn } from "./finn";
import { gabriel } from "./gabriel";
import { ivy } from "./ivy";
import { lena } from "./lena";
import { max } from "./max";
import { nova } from "./nova";
import { quinn } from "./quinn";
import { rex } from "./rex";
import { tess } from "./tess";

export async function runAgent<T = Record<string, unknown>>(
  agent: BaseAgent,
  userMessage: string,
  context?: AgentContext
): Promise<AgentResponse<T>>;
export async function runAgent<T = Record<string, unknown>>(
  name: AgentName,
  input: Record<string, unknown>
): Promise<AgentResponse<T>>;
export async function runAgent<T = Record<string, unknown>>(
  first: BaseAgent | AgentName,
  second: string | Record<string, unknown>,
  context: AgentContext = {}
): Promise<AgentResponse<T>> {
  if (typeof first !== "string") {
    return first.run<T>(second as string, context);
  }

  const registry: Record<AgentName, BaseAgent> = {
    ALICE: alice,
    MAX: max,
    QUINN: quinn,
    NOVA: nova,
    REX: rex,
    IVY: ivy,
    FINN: finn,
    LENA: lena,
    TESS: tess,
    GABRIEL: gabriel,
  };
  const input = second as Record<string, unknown>;
  const prompt = `Automation ${first} run. Payload: ${JSON.stringify(input)}`;
  return registry[first].run<T>(prompt, {
    jobId: typeof input.jobId === "string" ? input.jobId : typeof input.job_id === "string" ? input.job_id : undefined,
    userId: typeof input.userId === "string" ? input.userId : typeof input.user_id === "string" ? input.user_id : undefined,
    tenantId: typeof input.tenantId === "string" ? input.tenantId : typeof input.tenant_id === "string" ? input.tenant_id : undefined,
  });
}
