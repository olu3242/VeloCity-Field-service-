// GET  /api/admin/capacity — queue saturation, load score, queue forecast, peak prediction
// POST /api/admin/capacity — push a queue sample or request a peak prediction
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  forecastQueue,
  getDepthTrend,
  getSampleHistory,
  recordSample,
  type QueueSample,
} from "@/lib/capacity/queue-forecaster";
import {
  assessSaturation,
  getSaturationHistory,
} from "@/lib/capacity/worker-saturation";
import { scoreLoad, getLoadHistory } from "@/lib/capacity/load-scorer";
import {
  predictPeak,
  getScalingRecommendation,
  getPeakHistory,
} from "@/lib/capacity/peak-predictor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const forecastWindowMs = parseInt(
    url.searchParams.get("forecastWindowMs") ?? String(15 * 60 * 1000),
    10
  );
  const historyLimit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "20", 10),
    100
  );

  const [saturation, loadScore, forecast, scalingRec, peakHistory] =
    await Promise.all([
      assessSaturation(),
      scoreLoad(),
      forecastQueue(forecastWindowMs),
      getScalingRecommendation(),
      getPeakHistory(),
    ]);

  return NextResponse.json({
    saturation,
    loadScore,
    forecast,
    depthTrend: getDepthTrend(),
    scalingRecommendation: scalingRec,
    history: {
      saturation: getSaturationHistory(),
      load: getLoadHistory(historyLimit),
      samples: getSampleHistory(historyLimit),
      peaks: peakHistory.slice(-10),
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;

  if (action === "record_sample") {
    const { depth, processingRate, workerCount } = body as Record<string, unknown>;
    if (
      typeof depth !== "number" ||
      typeof processingRate !== "number" ||
      typeof workerCount !== "number"
    ) {
      return NextResponse.json(
        { error: "depth, processingRate, and workerCount (numbers) required" },
        { status: 400 }
      );
    }
    const sample: QueueSample = {
      timestamp: Date.now(),
      depth,
      processingRate,
      workerCount,
    };
    recordSample(sample);
    return NextResponse.json({ action: "record_sample", sample, success: true });
  }

  if (action === "predict_peak") {
    const { windowLabel, multiplier } = body as Record<string, unknown>;
    const label = typeof windowLabel === "string" ? windowLabel : "custom";
    const mult = typeof multiplier === "number" ? multiplier : 2.0;

    const prediction = await predictPeak(label, mult);
    return NextResponse.json({ action: "predict_peak", prediction, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'record_sample' or 'predict_peak'.` },
    { status: 400 }
  );
}
