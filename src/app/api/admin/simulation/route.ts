// GET  /api/admin/simulation — twin config/state, simulation history, resilience report
// POST /api/admin/simulation — run_simulation | what_if | capture_twin_state | update_twin_config
//                              | run_resilience_test | run_all_resilience_tests
// Admin-only; tenant-scoped. Fully isolated from production runtime — no DB writes, no event emission.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  runSimulation,
  getSimulationHistory,
  runWhatIfAnalysis,
  type SimulationScenario,
  type SimulationParams,
} from "@/lib/simulation/engine";
import {
  updateTwinConfig,
  getTwinConfig,
  captureState,
  getLatestState,
  getStateHistory,
} from "@/lib/simulation/digital-twin";
import {
  runResilienceTest,
  runAllResilienceTests,
  getResilienceReport,
  type ResilienceTest,
} from "@/lib/simulation/resilience-tester";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SCENARIOS: SimulationScenario[] = [
  "queue_stress", "retry_storm", "webhook_failure", "sla_degradation",
  "replay_safety", "tenant_scale", "ai_congestion",
];

const VALID_TESTS: ResilienceTest[] = [
  "failover_safety", "replay_safety", "retry_safety",
  "tenant_isolation", "circuit_breaker_recovery", "governance_enforcement",
];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Builds a validated SimulationParams from raw request input.
function buildParams(raw: Record<string, unknown>): SimulationParams | null {
  const { scenario, durationSeconds, intensityMultiplier, tenantCount, config } = raw;
  if (!VALID_SCENARIOS.includes(scenario as SimulationScenario)) return null;

  const parsed: SimulationParams = {
    scenario: scenario as SimulationScenario,
    durationSeconds: num(durationSeconds, 60),
    intensityMultiplier: num(intensityMultiplier, 1),
    ...(typeof tenantCount === "number" ? { tenantCount } : {}),
  };

  if (config && typeof config === "object") {
    const c = config as Record<string, unknown>;
    parsed.config = {
      ...(typeof c.workerCount === "number" ? { workerCount: c.workerCount } : {}),
      ...(typeof c.aiCapacity === "number" ? { aiCapacity: c.aiCapacity } : {}),
      ...(typeof c.queueLimit === "number" ? { queueLimit: c.queueLimit } : {}),
    };
  }

  return parsed;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    twin: {
      config: getTwinConfig(),
      latestState: getLatestState(),
      stateHistory: getStateHistory(limit),
    },
    simulations: {
      history: getSimulationHistory(),
      supportedScenarios: VALID_SCENARIOS,
    },
    resilience: {
      report: getResilienceReport(),
      supportedTests: VALID_TESTS,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (action === "run_simulation") {
    const params = buildParams(raw);
    if (!params) {
      return NextResponse.json(
        { error: `scenario must be one of: ${VALID_SCENARIOS.join(", ")}` },
        { status: 400 }
      );
    }
    const result = runSimulation(params);
    return NextResponse.json({ action: "run_simulation", result, success: true }, { status: 201 });
  }

  if (action === "what_if") {
    const { baseline, variations } = raw;
    if (!baseline || typeof baseline !== "object") {
      return NextResponse.json({ error: "baseline params object required" }, { status: 400 });
    }
    const baseParams = buildParams(baseline as Record<string, unknown>);
    if (!baseParams) {
      return NextResponse.json(
        { error: `baseline.scenario must be one of: ${VALID_SCENARIOS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!Array.isArray(variations) || variations.length === 0) {
      return NextResponse.json({ error: "variations must be a non-empty array" }, { status: 400 });
    }

    // Each variation is a partial override of the baseline; only known keys are carried through.
    const parsedVariations: Partial<SimulationParams>[] = variations.map((v) => {
      const item = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return {
        ...(VALID_SCENARIOS.includes(item.scenario as SimulationScenario)
          ? { scenario: item.scenario as SimulationScenario }
          : {}),
        ...(typeof item.durationSeconds === "number"
          ? { durationSeconds: item.durationSeconds }
          : {}),
        ...(typeof item.intensityMultiplier === "number"
          ? { intensityMultiplier: item.intensityMultiplier }
          : {}),
        ...(typeof item.tenantCount === "number" ? { tenantCount: item.tenantCount } : {}),
      };
    });

    const results = runWhatIfAnalysis(baseParams, parsedVariations);
    return NextResponse.json(
      { action: "what_if", baseline: results[0], variations: results.slice(1), success: true },
      { status: 201 }
    );
  }

  if (action === "capture_twin_state") {
    const {
      queueDepth, processingWorkers, aiCallsPerMinute,
      disputeOpenCount, payoutPendingCents, activeProviders,
    } = raw;
    if (typeof queueDepth !== "number") {
      return NextResponse.json({ error: "queueDepth must be a number" }, { status: 400 });
    }
    const state = captureState({
      queueDepth,
      processingWorkers: num(processingWorkers, 0),
      aiCallsPerMinute: num(aiCallsPerMinute, 0),
      disputeOpenCount: num(disputeOpenCount, 0),
      payoutPendingCents: num(payoutPendingCents, 0),
      activeProviders: num(activeProviders, 0),
    });
    return NextResponse.json({ action: "capture_twin_state", state, success: true }, { status: 201 });
  }

  if (action === "update_twin_config") {
    const { config } = raw;
    if (!config || typeof config !== "object") {
      return NextResponse.json({ error: "config object required" }, { status: 400 });
    }
    const c = config as Record<string, unknown>;
    const partial = {
      ...(typeof c.avgProcessingTimeMs === "number"
        ? { avgProcessingTimeMs: c.avgProcessingTimeMs }
        : {}),
      ...(typeof c.workerCount === "number" ? { workerCount: c.workerCount } : {}),
      ...(typeof c.aiCallCapacity === "number" ? { aiCallCapacity: c.aiCallCapacity } : {}),
      ...(typeof c.slaThresholdMs === "number" ? { slaThresholdMs: c.slaThresholdMs } : {}),
      ...(typeof c.tenantCount === "number" ? { tenantCount: c.tenantCount } : {}),
    };
    if (Object.keys(partial).length === 0) {
      return NextResponse.json(
        { error: "config must contain at least one known numeric field" },
        { status: 400 }
      );
    }
    updateTwinConfig(partial);
    return NextResponse.json({ action: "update_twin_config", config: getTwinConfig(), success: true });
  }

  if (action === "run_resilience_test") {
    const { test } = raw;
    if (!VALID_TESTS.includes(test as ResilienceTest)) {
      return NextResponse.json(
        { error: `test must be one of: ${VALID_TESTS.join(", ")}` },
        { status: 400 }
      );
    }
    const result = runResilienceTest(test as ResilienceTest);
    return NextResponse.json({ action: "run_resilience_test", result, success: true });
  }

  if (action === "run_all_resilience_tests") {
    const results = runAllResilienceTests();
    return NextResponse.json({
      action: "run_all_resilience_tests",
      results,
      report: getResilienceReport(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'run_simulation', 'what_if', 'capture_twin_state', 'update_twin_config', 'run_resilience_test', or 'run_all_resilience_tests'.`,
    },
    { status: 400 }
  );
}
