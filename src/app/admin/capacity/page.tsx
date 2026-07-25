// /admin/capacity — Queue saturation, load score, peak forecast, scaling recommendations.
// Server-rendered; admin-only.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { assessSaturation, getSaturationHistory } from "@/lib/capacity/worker-saturation";
import { scoreLoad } from "@/lib/capacity/load-scorer";
import { forecastQueue, getDepthTrend, getSampleHistory } from "@/lib/capacity/queue-forecaster";
import { getScalingRecommendation, getPeakHistory } from "@/lib/capacity/peak-predictor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function saturationBadge(level: string) {
  if (level === "critical") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (level === "saturated") return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
  if (level === "elevated") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
  return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
}

function loadBadge(level: string) {
  if (level === "critical") return "text-red-600 dark:text-red-400";
  if (level === "high") return "text-orange-600 dark:text-orange-400";
  if (level === "moderate") return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function riskBadge(level: string) {
  if (level === "high") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (level === "medium") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
  return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
}

export default async function CapacityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  getTenantId(profile);

  const [saturation, loadScore, forecast, scalingRec] = await Promise.all([
    assessSaturation(),
    scoreLoad(),
    forecastQueue(15 * 60 * 1000),
    getScalingRecommendation(),
  ]);

  const depthTrend = getDepthTrend();
  const saturationHistory = getSaturationHistory();
  const samples = getSampleHistory(20);
  const peakHistory = getPeakHistory().slice(-6);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Capacity</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Queue saturation · load scoring · peak forecasting
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${saturationBadge(saturation.saturationLevel)}`}>
              {saturation.saturationLevel}
            </span>
            <Link
              href="/admin/dashboard"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Admin
            </Link>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Queue Depth", value: saturation.queueDepth },
            { label: "Active Workers", value: saturation.workerCount },
            {
              label: "Utilization",
              value: `${Math.round(saturation.utilizationPct)}%`,
              warn: saturation.utilizationPct >= 70,
              danger: saturation.utilizationPct >= 90,
            },
            {
              label: "Load Score",
              value: `${Math.round(loadScore.compositeScore)}`,
              warn: loadScore.compositeScore < 60,
              danger: loadScore.compositeScore < 40,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
              <div className={`text-2xl font-semibold mt-1 tabular-nums ${
                s.danger ? "text-red-600 dark:text-red-400" :
                s.warn ? "text-yellow-600 dark:text-yellow-400" :
                "text-gray-900 dark:text-white"
              }`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Saturation + Load detail */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Worker Saturation</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Events per worker</span>
                <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                  {saturation.eventsPerWorker.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Saturation level</span>
                <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${saturationBadge(saturation.saturationLevel)}`}>
                  {saturation.saturationLevel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Depth trend</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {depthTrend === "growing" ? "↑ Growing" : depthTrend === "shrinking" ? "↓ Shrinking" : "→ Stable"}
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-600 dark:text-gray-400">{saturation.recommendation}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Load Scores</h2>
            <div className="space-y-2">
              {[
                { label: "Queue score", value: loadScore.queueScore },
                { label: "Worker score", value: loadScore.workerScore },
                { label: "AI circuit score", value: loadScore.aiScore },
                { label: "Composite", value: loadScore.compositeScore, bold: true },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0">{row.label}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.round(row.value)}%` }}
                    />
                  </div>
                  <span className={`text-xs tabular-nums w-8 text-right ${row.bold ? `font-semibold ${loadBadge(loadScore.loadLevel)}` : "text-gray-600 dark:text-gray-400"}`}>
                    {Math.round(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Forecast + Peak predictions */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">15-Min Queue Forecast</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Predicted depth</span>
                <span className="tabular-nums text-gray-900 dark:text-white">
                  {Math.round(forecast.predictedDepth)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Predicted rate</span>
                <span className="tabular-nums text-gray-900 dark:text-white">
                  {Math.round(forecast.predictedProcessingRate)}/min
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Capacity headroom</span>
                <span className={`tabular-nums font-semibold ${forecast.capacityHeadroomPct < 20 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {Math.round(forecast.capacityHeadroomPct)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Confidence</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {Math.round(forecast.confidenceScore * 100)}%
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
              {scalingRec}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Peak Prediction History</h2>
            {peakHistory.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No peak predictions yet. POST to /api/admin/capacity with action=predict_peak to generate one.
              </p>
            ) : (
              <div className="space-y-1.5">
                {peakHistory.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400 font-mono">{p.windowLabel}</span>
                    <span className="text-gray-700 dark:text-gray-300">depth: {p.expectedPeakDepth}</span>
                    <span className="text-gray-700 dark:text-gray-300">{p.recommendedWorkers} workers</span>
                    <span className={`rounded px-1.5 py-0.5 font-medium ${riskBadge(p.riskLevel)}`}>
                      {p.riskLevel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Saturation history */}
        {saturationHistory.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Saturation History</h2>
            <div className="flex items-end gap-1 h-12">
              {saturationHistory.map((s, i) => (
                <div
                  key={i}
                  title={`${s.saturationLevel} — ${Math.round(s.utilizationPct)}%`}
                  className={`flex-1 rounded-sm ${
                    s.saturationLevel === "critical" ? "bg-red-400" :
                    s.saturationLevel === "saturated" ? "bg-orange-400" :
                    s.saturationLevel === "elevated" ? "bg-yellow-400" :
                    "bg-green-400"
                  }`}
                  style={{ height: `${Math.max(8, s.utilizationPct)}%` }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-400 dark:text-gray-600 text-right">
          Capacity Monitor · {new Date().toISOString()}
        </div>
      </div>
    </div>
  );
}
