// AI Planning Layer — generates execution plans before workstream execution.
// Uses @anthropic-ai/sdk (already a project dependency) to determine execution
// order, parallelization opportunities, risk assessment, and fallback strategies.
// The planner is advisory: its plan informs graph generation but never blocks execution.

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";
import { generateRequestId } from "@/lib/tracing/span";
import { buildGraph, singleNodeGraph } from "./graph";
import type { ExecutionPlan, ExecutionGraph, KnowledgeContext } from "./types";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ── Planner prompt ────────────────────────────────────────────────────────────

function buildPlannerPrompt(
  workstream: string,
  workflow: string,
  intent: string,
  knowledge: KnowledgeContext | undefined,
  riskHints: string[],
): string {
  const knowledgeSummary = knowledge
    ? `Known context: ${knowledge.nodes ?? 0} entities, ${knowledge.edges ?? 0} relationships. Hints: ${knowledge.hints.join("; ")}.`
    : "No prior knowledge context available.";

  return `You are the AI Planning Layer for the Velocity Enterprise Workstream Execution Fabric.

WORKSTREAM: ${workstream}
WORKFLOW: ${workflow}
INTENT: ${intent}

${knowledgeSummary}
${riskHints.length > 0 ? `Risk signals:\n${riskHints.map((h) => `- ${h}`).join("\n")}` : ""}

Generate a structured execution plan. Break the workflow into concrete steps. Identify which steps can run in parallel. Assess risk. Recommend recovery strategies.

CRITICAL: Respond ONLY with valid JSON in this exact shape:
{
  "estimatedDurationMs": <number>,
  "riskScore": <number between 0.0 and 1.0>,
  "recommendedRecovery": "<string>",
  "plannerNotes": "<string, max 200 chars>",
  "steps": [
    { "id": "<step-id>", "name": "<name>", "workstream": "<workstream>", "dependsOn": ["<step-id>"] }
  ]
}

Steps must form a valid DAG (no cycles). Use empty dependsOn [] for root steps.`;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

interface RawPlan {
  estimatedDurationMs?: number;
  riskScore?: number;
  recommendedRecovery?: string;
  plannerNotes?: string;
  steps?: Array<{
    id: string;
    name: string;
    workstream: string;
    dependsOn?: string[];
  }>;
}

function extractJSON(text: string): RawPlan | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  try {
    return JSON.parse(raw.trim()) as RawPlan;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as RawPlan;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Fallback plan (when AI is unavailable) ────────────────────────────────────

function fallbackPlan(workstream: string, workflow: string): ExecutionPlan {
  const graph = singleNodeGraph(workstream, workflow);
  return {
    estimatedDurationMs: 5000,
    parallelNodes: 1,
    criticalPath: graph.nodes.map((n) => n.id),
    riskScore: 0.1,
    recommendedRecovery: "Retry with exponential backoff",
    plannerNotes: "AI planning unavailable — using single-node fallback plan",
    graph,
  };
}

// ── Main planner ──────────────────────────────────────────────────────────────

export interface PlannerOptions {
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function generateExecutionPlan(
  workstream: string,
  workflow: string,
  intent: string,
  knowledge?: KnowledgeContext,
  riskHints: string[] = [],
  opts: PlannerOptions = {},
): Promise<ExecutionPlan> {
  const model = opts.model ?? "claude-haiku-4-5-20251001";
  const maxTokens = opts.maxTokens ?? 1024;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: buildPlannerPrompt(workstream, workflow, intent, knowledge, riskHints),
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : null;
    if (!text) return fallbackPlan(workstream, workflow);

    const raw = extractJSON(text);
    if (!raw || !Array.isArray(raw.steps) || raw.steps.length === 0) {
      return fallbackPlan(workstream, workflow);
    }

    const graph: ExecutionGraph = buildGraph(
      raw.steps.map((s) => ({
        id: s.id,
        name: s.name,
        workstream: s.workstream ?? workstream,
        dependsOn: s.dependsOn ?? [],
      })),
    );

    const parallelNodes = graph.nodes.filter((n) => n.dependencies.length === 0).length;

    return {
      estimatedDurationMs: Number(raw.estimatedDurationMs) || 5000,
      parallelNodes: Math.max(1, parallelNodes),
      criticalPath: graph.criticalPath,
      riskScore: Math.max(0, Math.min(1, Number(raw.riskScore) || 0.1)),
      recommendedRecovery: raw.recommendedRecovery ?? "Retry",
      plannerNotes: (raw.plannerNotes ?? "").slice(0, 200),
      graph,
    };
  } catch {
    return fallbackPlan(workstream, workflow);
  }
}

// ── Plan accuracy scoring (for continuous learning) ───────────────────────────

export function scorePlanAccuracy(
  plan: ExecutionPlan,
  actualDurationMs: number,
  actualNodeCount: number,
): number {
  const durationAccuracy =
    1 - Math.abs(plan.estimatedDurationMs - actualDurationMs) / Math.max(plan.estimatedDurationMs, actualDurationMs);
  const nodeAccuracy =
    plan.graph.nodes.length === actualNodeCount ? 1 : 0.5;
  return Math.max(0, (durationAccuracy + nodeAccuracy) / 2);
}
