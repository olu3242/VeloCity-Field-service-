"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, AlertTriangle, CheckCircle, Clock, DollarSign,
  RefreshCw, XCircle, Zap, Bot, TrendingUp, Heart, Server, Cpu,
} from "lucide-react";
import type { PlatformHealth } from "@/lib/contracts/runtime";

interface AutomationStatus {
  queue: { pending: number; failed: number; completed_24h: number };
  recent_runs: Array<{
    id: string; event_type: string; handler: string; status: string;
    duration_ms: number | null; error_message: string | null; created_at: string;
  }>;
  recent_events: Array<{
    id: string; event_type: string; status: string; created_at: string;
  }>;
  payouts_pending: number;
  health?: PlatformHealth;
}

function HealthBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const styles = {
    healthy:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    degraded: "bg-amber-100 text-amber-700 border-amber-200",
    down:     "bg-red-100 text-red-700 border-red-200",
  };
  const icons = {
    healthy:  <CheckCircle className="h-3.5 w-3.5" />,
    degraded: <AlertTriangle className="h-3.5 w-3.5" />,
    down:     <XCircle className="h-3.5 w-3.5" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${styles[status]}`}>
      {icons[status]} {status}
    </span>
  );
}

function formatAge(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

function statusColor(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-100 text-emerald-700";
    case "failed":    return "bg-red-100 text-red-700";
    case "running":   return "bg-blue-100 text-blue-700";
    case "pending":   return "bg-amber-100 text-amber-700";
    case "skipped":   return "bg-gray-100 text-gray-600";
    default:          return "bg-gray-100 text-gray-600";
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle className="h-3.5 w-3.5" />;
    case "failed":    return <XCircle className="h-3.5 w-3.5" />;
    case "running":   return <Activity className="h-3.5 w-3.5 animate-pulse" />;
    default:          return <Clock className="h-3.5 w-3.5" />;
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export default function AutomationDashboard() {
  const [data, setData]         = useState<AutomationStatus | null>(null);
  const [loading, setLoading]   = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/automation/status");
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function triggerProcess() {
    setProcessing(true);
    try {
      await fetch("/api/automation/process", { method: "POST" });
      await fetchStatus();
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const queue = data?.queue ?? { pending: 0, failed: 0, completed_24h: 0 };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-500" />
            Automation Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI OS — 10 agents, event-driven orchestration
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button variant="outline" size="sm" onClick={fetchStatus}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={triggerProcess} disabled={processing}>
            {processing ? <Activity className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
            Process Queue
          </Button>
        </div>
      </div>

      {/* Runtime Health */}
      {data?.health && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="h-4 w-4 text-rose-500" />
              Runtime Health
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                {new Date(data.health.timestamp).toLocaleTimeString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4 text-yellow-500" /> Automation Engine
                </div>
                <HealthBadge status={data.health.automation_engine} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cpu className="h-4 w-4 text-purple-500" /> AI Runtime
                </div>
                <HealthBadge status={data.health.ai_runtime} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4 text-emerald-500" /> Stripe
                </div>
                <HealthBadge status={data.health.stripe} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded bg-muted/40">
                <p className="text-2xl font-bold">{data.health.queue.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Queue</p>
              </div>
              <div className="p-3 rounded bg-amber-50">
                <p className="text-2xl font-bold text-amber-700">{data.health.queue.pending}</p>
                <p className="text-xs text-amber-600 mt-0.5">Pending</p>
              </div>
              <div className="p-3 rounded bg-emerald-50">
                <p className="text-2xl font-bold text-emerald-700">{data.health.queue.completed}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Completed</p>
              </div>
              <div className="p-3 rounded bg-red-50">
                <p className="text-2xl font-bold text-red-700">{data.health.queue.failed}</p>
                <p className="text-xs text-red-600 mt-0.5">Failed</p>
              </div>
            </div>
            {data.health.queue.oldest_pending_age_ms !== null && (
              <p className="text-xs text-muted-foreground mt-3">
                <Server className="h-3 w-3 inline mr-1" />
                Oldest pending item: {formatAge(data.health.queue.oldest_pending_age_ms)} ago
                {data.health.last_processed_at && (
                  <span className="ml-3">Last run: {timeAgo(data.health.last_processed_at)}</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
                <p className="text-3xl font-bold mt-1">{queue.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Failed</p>
                <p className="text-3xl font-bold mt-1 text-red-600">{queue.failed}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Completed (24h)</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600">{queue.completed_24h}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Payouts Queued</p>
                <p className="text-3xl font-bold mt-1 text-blue-600">{data?.payouts_pending ?? 0}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Status Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Agent Registry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { name: "ALICE", role: "Intake & Classification",    color: "bg-purple-100 text-purple-700"  },
              { name: "MAX",   role: "Dispatch & Matching",         color: "bg-blue-100 text-blue-700"     },
              { name: "NOVA",  role: "Workflow Orchestration",      color: "bg-cyan-100 text-cyan-700"     },
              { name: "QUINN", role: "Quote & Pricing",             color: "bg-orange-100 text-orange-700" },
              { name: "FINN",  role: "Finance & Payments",          color: "bg-emerald-100 text-emerald-700"},
              { name: "REX",   role: "Trust & Reviews",             color: "bg-yellow-100 text-yellow-700" },
              { name: "IVY",   role: "Dispute Resolution",          color: "bg-red-100 text-red-700"       },
              { name: "LENA",  role: "Retention & Rebooking",       color: "bg-pink-100 text-pink-700"     },
              { name: "TESS",  role: "Territory & Market Intel",    color: "bg-green-100 text-green-700"   },
              { name: "GABRIEL",role: "Governance & Compliance",    color: "bg-indigo-100 text-indigo-700" },
            ].map((agent) => (
              <div key={agent.name} className={`rounded-lg p-3 ${agent.color}`}>
                <p className="font-bold text-sm">{agent.name}</p>
                <p className="text-xs mt-0.5 opacity-80">{agent.role}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Recent Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.recent_events?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No events yet</p>
            )}
            {data?.recent_events?.map((event) => (
              <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(event.status)}`}>
                    <StatusIcon status={event.status} />
                    {event.status}
                  </span>
                  <span className="text-sm font-mono text-xs">{event.event_type}</span>
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(event.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Runs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Recent Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.recent_runs?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No runs yet</p>
            )}
            {data?.recent_runs?.map((run) => (
              <div key={run.id} className="py-2 border-b last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(run.status)}`}>
                      <StatusIcon status={run.status} />
                      {run.status}
                    </span>
                    <span className="text-xs font-mono">{run.event_type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {run.duration_ms && <span>{run.duration_ms}ms</span>}
                    <span>{timeAgo(run.created_at)}</span>
                  </div>
                </div>
                {run.error_message && (
                  <p className="text-xs text-red-600 mt-1 truncate">{run.error_message}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Cron Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Cron Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {[
              { schedule: "Every 1 min",  endpoint: "/api/cron/sla",     jobs: ["SLA check", "Stuck job detection", "Expired offer cleanup", "Queue processing"] },
              { schedule: "Every 5 min",  endpoint: "/api/automation/process", jobs: ["Retry failed events", "Process pending queue"] },
              { schedule: "Every 1 hour", endpoint: "/api/cron/payouts", jobs: ["Process ready payouts", "Retry failed payouts"] },
              { schedule: "Daily 3 AM",   endpoint: "/api/cron/daily",   jobs: ["Territory analysis (TESS)", "Provider scoring (LENA)", "Retention campaigns (LENA)"] },
            ].map((cron) => (
              <div key={cron.endpoint} className="py-3 flex items-start gap-4">
                <div className="min-w-[120px]">
                  <Badge variant="outline" className="font-mono text-xs">{cron.schedule}</Badge>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{cron.endpoint}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cron.jobs.map((j) => (
                      <span key={j} className="text-xs bg-muted px-2 py-0.5 rounded">{j}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SLA Alert Banner */}
      {queue.failed > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="font-medium text-red-800">
              {queue.failed} failed queue item{queue.failed !== 1 ? "s" : ""} require attention
            </p>
            <p className="text-sm text-red-600 mt-0.5">
              Items retry automatically with exponential backoff (max 3 attempts). Check agent logs for details.
            </p>
          </div>
          <Button variant="destructive" size="sm" className="ml-auto" onClick={triggerProcess}>
            Retry Now
          </Button>
        </div>
      )}
    </div>
  );
}
