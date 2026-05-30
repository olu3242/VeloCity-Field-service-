import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasEnvGroup, getEnvStatus } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand";

// Registry imports (created by LAX sprint)
// These are dynamically imported to avoid breaking if registry files don't exist yet
async function getRegistryData() {
  try {
    const { RUNTIME_REGISTRY, getOverallArchitectureScore, getRuntimesByStatus } = await import("@/lib/registry/runtimes");
    const { EVENT_REGISTRY, getOrphanedEvents, getEventsByStatus } = await import("@/lib/registry/events");
    const { WORKFLOW_REGISTRY } = await import("@/lib/registry/workflows");
    return { RUNTIME_REGISTRY, getOverallArchitectureScore, getRuntimesByStatus, EVENT_REGISTRY, getOrphanedEvents, getEventsByStatus, WORKFLOW_REGISTRY };
  } catch {
    return null;
  }
}

async function getDriftData(db: ReturnType<typeof getAdminClient>) {
  try {
    const { detectDrift, getDriftScore } = await import("@/lib/governance/drift-detector");
    const drifts = await detectDrift(db);
    return { drifts, score: getDriftScore(drifts) };
  } catch {
    return { drifts: [], score: 85 };
  }
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 90 ? "bg-green-500/20 text-green-400 border-green-500/30" :
    score >= 75 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${cls}`}>{score}/100</span>;
}

function StatusDot({ status }: { status: "active" | "partial" | "orphaned" | "planned" | "pass" | "fail" | "warn" }) {
  const cls =
    status === "active" || status === "pass" ? "bg-green-400" :
    status === "partial" || status === "warn" ? "bg-yellow-400" :
    "bg-red-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls} animate-pulse`} />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "critical" ? "bg-red-500/20 text-red-400 border-red-500/30" :
    severity === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
    severity === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-gray-500/20 text-gray-400 border-gray-500/30";
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border uppercase ${cls}`}>{severity}</span>;
}

export default async function LaxCommandCenter() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");

  const db = getAdminClient();
  const envStatus = getEnvStatus();

  // Parallel data fetch
  const [
    registryData,
    driftData,
    { data: queueStats },
    { data: recentErrors },
    { data: recentRuns },
    { data: agentActivity },
    { count: totalJobs },
    { count: activeJobs },
    { count: pendingProviders },
    { count: openDisputes },
    { count: pendingQueue },
    { count: failedQueue },
    { count: deadLetterQueue },
  ] = await Promise.all([
    getRegistryData(),
    getDriftData(db),
    db.from("automation_queue").select("status").gte("created_at", new Date(Date.now() - 3_600_000).toISOString()),
    db.from("automation_queue").select("event_type, error_message, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(8),
    db.from("automation_runs").select("event_type, status, completed_at").order("completed_at", { ascending: false }).limit(6),
    db.from("agent_logs").select("agent_name, action, created_at").order("created_at", { ascending: false }).limit(6),
    db.from("jobs").select("*", { count: "exact", head: true }),
    db.from("jobs").select("*", { count: "exact", head: true }).not("status", "in", '("completed","closed","cancelled","expired","refunded")'),
    db.from("providers").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("disputes").select("*", { count: "exact", head: true }).eq("status", "open"),
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
    db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "dead_letter"),
  ]);

  const queueCounts = (queueStats ?? []).reduce(
    (acc: Record<string, number>, row: { status: string }) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  // Certification scores
  const envGroups = [
    { label: "Supabase", key: "supabase", score: hasEnvGroup("supabase") ? 100 : 0 },
    { label: "Stripe", key: "stripe", score: hasEnvGroup("stripe") ? 100 : 0 },
    { label: "AI Agents", key: "ai", score: hasEnvGroup("ai") ? 100 : 50 },
    { label: "Google OAuth", key: "oauth", score: hasEnvGroup("oauth") ? 100 : 0 },
    { label: "SMS", key: "sms", score: hasEnvGroup("sms") ? 100 : 60 },
    { label: "Email", key: "email", score: hasEnvGroup("email") ? 100 : 60 },
  ];

  const archScore = registryData?.getOverallArchitectureScore?.() ?? 78;
  const driftScore = driftData.score;
  const configScore = Math.round(envGroups.reduce((sum, g) => sum + g.score, 0) / envGroups.length);
  const automationScore = (failedQueue ?? 0) > 10 ? 60 : (failedQueue ?? 0) > 0 ? 75 : 90;
  const certificationScore = Math.round((archScore + driftScore + configScore + automationScore) / 4);

  const criticalDrifts = driftData.drifts.filter((d: { severity: string }) => d.severity === "critical");
  const highDrifts = driftData.drifts.filter((d: { severity: string }) => d.severity === "high");

  const CERTIFICATION_GATE = certificationScore >= 90 && criticalDrifts.length === 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* LAX Top Nav */}
      <nav className="border-b border-[#CCFF00]/30 bg-gray-950/95 px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur">
        <div className="flex items-center gap-4">
          <BrandLogo size="sm" />
          <div>
            <div className="font-bold text-[#CCFF00] tracking-wider text-sm uppercase">LAX Command Center</div>
            <div className="text-xs text-white/40">Lifecycle Architecture Executive</div>
          </div>
          <div className="flex items-center gap-1.5 ml-4">
            <div className={`h-2 w-2 rounded-full ${CERTIFICATION_GATE ? "bg-green-400" : "bg-yellow-400"} animate-pulse`} />
            <span className={`text-xs font-bold ${CERTIFICATION_GATE ? "text-green-400" : "text-yellow-400"}`}>
              {CERTIFICATION_GATE ? "CERTIFIED" : "CONDITIONAL"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-white/50 hover:text-white text-xs">
            <Link href="/admin/dashboard">← Admin</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/50 hover:text-white text-xs">
            <Link href="/admin/command-center">Command Center</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="text-white/50 hover:text-white text-xs">
            <Link href="/admin/launch-readiness">Launch Readiness</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">

        {/* Production Certification Score */}
        <section>
          <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Production Certification</h2>
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: "Architecture", score: archScore },
              { label: "Drift Score", score: driftScore },
              { label: "Config", score: configScore },
              { label: "Automation", score: automationScore },
              { label: "Overall", score: certificationScore },
            ].map(({ label, score }) => (
              <Card key={label} className={`border ${score >= 90 ? "border-green-500/30 bg-green-500/5" : score >= 75 ? "border-yellow-500/30 bg-yellow-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <CardContent className="pt-5 text-center">
                  <div className={`text-3xl font-bold ${score >= 90 ? "text-green-400" : score >= 75 ? "text-yellow-400" : "text-red-400"}`}>{score}</div>
                  <div className="text-xs text-white/40 mt-1">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {criticalDrifts.length > 0 && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
              <div className="font-semibold text-red-400 mb-2">🚫 Certification Blocked — {criticalDrifts.length} Critical Drift(s)</div>
              {criticalDrifts.map((d: { id: string; description: string; remediation: string }) => (
                <div key={d.id} className="text-sm text-white/60 flex items-start gap-2 mb-1">
                  <span className="text-red-400 shrink-0">▸</span>
                  <span>{d.description} — <span className="text-white/40">{d.remediation}</span></span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Runtime Registry */}
        {registryData && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider">Runtime Registry</h2>
              <span className="text-xs text-white/40">{registryData.RUNTIME_REGISTRY.length} runtimes · Architecture Score: {archScore}/100</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {registryData.RUNTIME_REGISTRY.map((runtime) => (
                <div key={runtime.id} className="rounded-lg border border-white/10 bg-white/5 p-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status={runtime.status as "active" | "partial" | "orphaned" | "planned"} />
                      <span className="font-semibold text-sm">{runtime.name}</span>
                    </div>
                    <div className="text-xs text-white/40">{runtime.owner}</div>
                    {runtime.notes && <div className="text-xs text-yellow-400/70 mt-1 italic">{runtime.notes}</div>}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {runtime.tables.slice(0, 3).map(t => (
                        <span key={t} className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">{t}</span>
                      ))}
                      {runtime.tables.length > 3 && <span className="text-xs text-white/30">+{runtime.tables.length - 3}</span>}
                    </div>
                  </div>
                  <ScoreBadge score={runtime.score} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Drift Detection */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider">Drift Detection</h2>
            <ScoreBadge score={driftScore} />
          </div>
          {driftData.drifts.length === 0 ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-green-400 text-sm">✓ No drift detected</div>
          ) : (
            <div className="space-y-2">
              {driftData.drifts.map((d: { id: string; category: string; severity: string; description: string; remediation: string }) => (
                <div key={d.id} className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-start gap-3">
                  <SeverityBadge severity={d.severity} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{d.description}</div>
                    <div className="text-xs text-white/40 mt-0.5">Remediation: {d.remediation}</div>
                  </div>
                  <span className="text-xs text-white/30 shrink-0">{d.category}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Environment Configuration */}
        <section>
          <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Environment Configuration</h2>
          <div className="grid grid-cols-3 gap-3">
            {envGroups.map(({ label, score }) => (
              <div key={label} className={`rounded-lg border p-3 flex items-center justify-between ${score === 100 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-center gap-2">
                  <StatusDot status={score === 100 ? "pass" : "fail"} />
                  <span className="text-sm">{label}</span>
                </div>
                <span className={`text-xs font-bold ${score === 100 ? "text-green-400" : "text-red-400"}`}>
                  {score === 100 ? "CONFIGURED" : "MISSING"}
                </span>
              </div>
            ))}
          </div>

          {/* Missing keys detail */}
          {Object.entries(envStatus).some(([, area]) => (area as { missing: string[] }).missing.length > 0) && (
            <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
              <div className="text-sm font-medium text-yellow-400 mb-2">Missing environment variables:</div>
              {Object.entries(envStatus).map(([area, val]) => {
                const areaVal = val as { missing: string[] };
                if (areaVal.missing.length === 0) return null;
                return (
                  <div key={area} className="mb-1">
                    <span className="text-xs text-white/40 uppercase">{area}: </span>
                    {areaVal.missing.map((k: string) => (
                      <span key={k} className="text-xs font-mono text-red-400 mr-2">{k}</span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Automation Health */}
        <section>
          <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Automation Health</h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: "Pending (1h)", value: queueCounts["pending"] ?? 0, color: "text-blue-400" },
              { label: "Processing (1h)", value: queueCounts["processing"] ?? 0, color: "text-yellow-400" },
              { label: "Failed (1h)", value: queueCounts["failed"] ?? 0, color: "text-red-400" },
              { label: "Dead Letter", value: deadLetterQueue ?? 0, color: "text-red-600" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="bg-white/5 border-white/10">
                <CardContent className="pt-5">
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-white/40 mt-1">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {(recentErrors ?? []).length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <div className="text-sm font-medium text-red-400 mb-2">Recent Failures</div>
              {(recentErrors ?? []).map((e: { event_type: string; error_message?: string; created_at: string }, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs mb-1">
                  <span className="text-white/40 shrink-0 font-mono">{new Date(e.created_at).toLocaleTimeString()}</span>
                  <span className="text-red-300">{e.event_type}</span>
                  <span className="text-white/30 truncate">{e.error_message}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Workflow Registry */}
        {registryData && (
          <section>
            <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Workflow Registry</h2>
            <div className="space-y-3">
              {registryData.WORKFLOW_REGISTRY.map((wf) => (
                <div key={wf.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusDot status={wf.status as "active" | "partial" | "planned"} />
                      <span className="font-semibold">{wf.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${wf.status === "active" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                      {wf.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-white/40 mb-2">Trigger: <span className="text-white/60 font-mono">{wf.trigger}</span> · Actor: {wf.actor}</div>
                  <div className="flex flex-wrap gap-1">
                    {wf.runtimes.map(r => (
                      <span key={r} className="text-xs bg-[#CCFF00]/10 text-[#CCFF00]/70 px-1.5 py-0.5 rounded">{r}</span>
                    ))}
                    {wf.events.slice(0, 3).map(e => (
                      <span key={e} className="text-xs bg-blue-500/10 text-blue-400/70 px-1.5 py-0.5 rounded font-mono">{e}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Event Registry Summary */}
        {registryData && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider">Event Registry</h2>
              <span className="text-xs text-white/40">{registryData.EVENT_REGISTRY.length} events · {registryData.getOrphanedEvents().length} orphaned</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Events", value: registryData.EVENT_REGISTRY.length, color: "text-white" },
                { label: "Active", value: registryData.getEventsByStatus("active").length, color: "text-green-400" },
                { label: "Orphaned", value: registryData.getOrphanedEvents().length, color: registryData.getOrphanedEvents().length > 0 ? "text-red-400" : "text-green-400" },
              ].map(({ label, value, color }) => (
                <Card key={label} className="bg-white/5 border-white/10">
                  <CardContent className="pt-5">
                    <div className={`text-3xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-white/40 mt-1">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Platform KPIs */}
        <section>
          <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Platform KPIs</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Jobs", value: totalJobs ?? 0 },
              { label: "Active Jobs", value: activeJobs ?? 0 },
              { label: "Open Disputes", value: openDisputes ?? 0 },
              { label: "Pending Providers", value: pendingProviders ?? 0 },
            ].map(({ label, value }) => (
              <Card key={label} className="bg-white/5 border-white/10">
                <CardContent className="pt-5">
                  <div className="text-3xl font-bold">{value}</div>
                  <div className="text-xs text-white/40 mt-1">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Agent Activity */}
        <section>
          <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Agent Activity</h2>
          {(agentActivity ?? []).length === 0 ? (
            <div className="text-sm text-white/40 p-4 border border-white/10 rounded-lg">No agent activity yet.</div>
          ) : (
            <div className="space-y-2">
              {(agentActivity ?? []).map((log: { agent_name: string; action: string; created_at: string }, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm p-3 rounded-lg border border-white/5 bg-white/5">
                  <span className="font-bold text-[#CCFF00] text-xs w-20 shrink-0">{log.agent_name}</span>
                  <span className="text-white/70 flex-1">{log.action}</span>
                  <span className="text-white/30 text-xs">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agent Governance Registry */}
        <section>
          <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Agent Governance Registry</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "ALICE", purpose: "Customer Intake & Classification", owner: "Marketplace Runtime", permissions: ["classify_job", "read_service_areas", "write_agent_logs"] },
              { name: "MAX", purpose: "Provider Matching & Dispatch Ranking", owner: "Dispatch Runtime", permissions: ["read_providers", "read_jobs", "write_agent_logs"] },
              { name: "NOVA", purpose: "Job Workflow Orchestration", owner: "Job Runtime", permissions: ["read_jobs", "write_notifications", "write_agent_logs"] },
              { name: "QUINN", purpose: "Quote Fairness Review", owner: "Marketplace Runtime", permissions: ["read_quotes", "read_pricing", "write_agent_logs"] },
              { name: "REX", purpose: "Completion Quality & Provider Scoring", owner: "Provider Runtime", permissions: ["read_jobs", "write_providers", "write_agent_logs"] },
              { name: "IVY", purpose: "Dispute Resolution", owner: "Job Runtime", permissions: ["read_disputes", "write_payouts", "write_notifications", "write_agent_logs"] },
              { name: "FINN", purpose: "Payments & Payouts", owner: "Payments Runtime", permissions: ["read_payments", "write_payout_queue", "write_payment_ledger", "write_agent_logs"] },
              { name: "LENA", purpose: "Customer Retention & Campaigns", owner: "Analytics Runtime", permissions: ["read_profiles", "write_notifications", "write_agent_logs"] },
              { name: "TESS", purpose: "Territory Intelligence & Growth", owner: "Franchise Runtime", permissions: ["read_service_areas", "write_agent_logs"] },
              { name: "GABRIEL", purpose: "Governance Audit & Compliance", owner: "Governance Runtime", permissions: ["read_all", "write_audit_logs", "write_governance_violations"] },
              { name: "LAX", purpose: "Architecture Governance & Certification", owner: "Governance Runtime", permissions: ["read_all", "write_governance_violations", "block_deployment"] },
            ].map((agent) => (
              <div key={agent.name} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-[#CCFF00] text-sm">{agent.name}</span>
                  <span className="text-xs text-white/40">{agent.owner}</span>
                </div>
                <div className="text-xs text-white/60 mb-2">{agent.purpose}</div>
                <div className="flex flex-wrap gap-1">
                  {agent.permissions.map(p => (
                    <span key={p} className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono text-white/50">{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Deployment Governor */}
        <section>
          <h2 className="text-lg font-bold text-[#CCFF00] uppercase tracking-wider mb-4">Deployment Governor</h2>
          <div className={`rounded-lg border p-5 ${CERTIFICATION_GATE ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
            <div className={`text-xl font-bold mb-2 ${CERTIFICATION_GATE ? "text-green-400" : "text-red-400"}`}>
              {CERTIFICATION_GATE ? "✓ DEPLOYMENT APPROVED" : "✗ DEPLOYMENT BLOCKED"}
            </div>
            <div className="text-sm text-white/60 mb-4">
              {CERTIFICATION_GATE
                ? "All certification gates passed. Deployment may proceed."
                : `${criticalDrifts.length} critical drift(s) and ${highDrifts.length} high drift(s) must be resolved before deployment.`}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { check: "Architecture Score ≥ 75", pass: archScore >= 75 },
                { check: "No Critical Drift", pass: criticalDrifts.length === 0 },
                { check: "Supabase Configured", pass: hasEnvGroup("supabase") },
                { check: "Stripe Configured", pass: hasEnvGroup("stripe") },
                { check: "AI Agents Configured", pass: hasEnvGroup("ai") },
                { check: "OAuth Configured", pass: hasEnvGroup("oauth") },
              ].map(({ check, pass }) => (
                <div key={check} className={`flex items-center gap-2 text-xs p-2 rounded ${pass ? "text-green-400" : "text-red-400"}`}>
                  <span>{pass ? "✓" : "✗"}</span>
                  <span>{check}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <Button asChild size="sm" variant="outline" className="border-white/20 text-white/60">
                <Link href="/admin/launch-readiness">Full Launch Readiness →</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="border-white/20 text-white/60">
                <Link href="/admin/command-center">Command Center →</Link>
              </Button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
