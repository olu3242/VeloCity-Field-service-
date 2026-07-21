import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { getOperatorState } from "@/lib/governance/operator";
import { generateEnterpriseCertification } from "@/lib/certification/enterprise-report";
import { getTenantId } from "@/lib/tenancy";

function certLevelColor(level: string): string {
  if (level === "enterprise") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (level === "premium") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (level === "standard") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  return "text-red-400";
}

function circuitStateColor(state: string): string {
  if (state === "closed") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (state === "open") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

export default async function AdminRuntimePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");

  // Throws if tenant_id missing — guards data integrity
  getTenantId(profile);

  // Gather all in-memory runtime data
  const cert = generateEnterpriseCertification();
  const circuits = getAllCircuits();
  const operatorState = getOperatorState();

  const openCircuits = circuits.filter((c) => c.state === "open");
  const disabledAgents = Array.from(operatorState.disabledAgents);
  const disabledEventTypes = Array.from(operatorState.disabledEventTypes);

  const certSections = [
    { name: "Architecture", score: cert.sections.architecture.score, pass: cert.sections.architecture.compliant },
    { name: "Topology", score: cert.sections.topology.score, pass: cert.sections.topology.valid },
    { name: "Readiness", score: cert.sections.readiness.score, pass: cert.sections.readiness.score >= 70 },
    { name: "Compliance", score: cert.sections.compliance.score, pass: cert.sections.compliance.compliant },
    { name: "Resilience", score: cert.sections.resilience.score, pass: cert.sections.resilience.score >= 70 },
  ];

  const checkedAt = new Date().toISOString();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">
            ⚡ Admin
          </Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Runtime Dashboard</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/mission-control" className="text-white/40 hover:text-white">
            Mission Control
          </Link>
          <Link href="/admin/command-center" className="text-white/40 hover:text-white">
            Command Center
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Runtime Dashboard</h1>
            <p className="text-white/40 text-sm mt-1">
              Read-only snapshot · Interactive controls at{" "}
              <Link href="/admin/mission-control" className="text-[#CCFF00] hover:underline">
                Mission Control
              </Link>
            </p>
          </div>
        </div>

        {/* 1. Status Banner */}
        {operatorState.runtimePaused && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-5 py-4 flex items-center gap-3">
            <span className="text-red-400 font-bold text-lg">RUNTIME PAUSED</span>
            {operatorState.pauseReason && (
              <span className="text-red-300/70 text-sm">— {operatorState.pauseReason}</span>
            )}
            {operatorState.pausedBy && (
              <span className="text-red-300/50 text-xs ml-auto">by {operatorState.pausedBy}</span>
            )}
          </div>
        )}

        <Card className="bg-gray-900 border-white/10 text-white">
          <CardHeader>
            <CardTitle className="text-sm text-white/60">Enterprise Certification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div>
                <div className={`text-5xl font-bold ${scoreColor(cert.overallScore)}`}>
                  {cert.overallScore}
                  <span className="text-2xl text-white/30">/100</span>
                </div>
                <div className="text-white/40 text-xs mt-1">Overall Score</div>
              </div>
              <div className="space-y-2">
                <Badge className={certLevelColor(cert.certificationLevel)}>
                  {cert.certificationLevel.toUpperCase()}
                </Badge>
                <div className="text-white/40 text-xs">
                  {cert.certified ? "Certified" : "Not Certified"}
                </div>
              </div>
              {openCircuits.length > 0 && (
                <div className="ml-auto">
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                    {openCircuits.length} circuit{openCircuits.length !== 1 ? "s" : ""} open
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Circuit Breakers */}
        <Card className="bg-gray-900 border-white/10 text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Circuit Breakers</CardTitle>
              <span className="text-white/30 text-xs">
                Reset open circuits from{" "}
                <Link href="/admin/mission-control" className="text-[#CCFF00] hover:underline">
                  Mission Control
                </Link>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {circuits.length === 0 ? (
              <div className="text-white/30 text-sm py-4 text-center">
                No circuit breakers registered yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {circuits.map((circuit) => (
                  <div
                    key={circuit.key}
                    className="rounded-lg border border-white/10 bg-gray-800/50 px-4 py-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-white/70 truncate">{circuit.key}</span>
                      <Badge className={circuitStateColor(circuit.state)}>
                        {circuit.state}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <span>{circuit.failureCount} failure{circuit.failureCount !== 1 ? "s" : ""}</span>
                      <span>{circuit.successCount} success</span>
                    </div>
                    {circuit.lastFailureAt && (
                      <div className="text-xs text-white/25">
                        Last failed: {new Date(circuit.lastFailureAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Certification Sections Table */}
        <Card className="bg-gray-900 border-white/10 text-white">
          <CardHeader>
            <CardTitle className="text-sm">Certification Sections</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs">
                  <th className="text-left pb-2 font-normal">Section</th>
                  <th className="text-right pb-2 font-normal">Score</th>
                  <th className="text-right pb-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {certSections.map((section) => (
                  <tr key={section.name}>
                    <td className="py-2.5 text-white/70">{section.name}</td>
                    <td className={`py-2.5 text-right font-mono font-medium ${scoreColor(section.score)}`}>
                      {section.score}
                    </td>
                    <td className="py-2.5 text-right">
                      {section.pass ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">pass</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">fail</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* 4. Critical Issues */}
        {cert.criticalIssues.length > 0 && (
          <Card className="bg-red-900/20 border-red-500/30 text-white">
            <CardHeader>
              <CardTitle className="text-sm text-red-400">
                Critical Issues ({cert.criticalIssues.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {cert.criticalIssues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-red-300/80">
                    <span className="mt-0.5 shrink-0 text-red-500">▲</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* 5. Recommendations */}
        {cert.recommendations.length > 0 && (
          <Card className="bg-yellow-900/10 border-yellow-500/20 text-white">
            <CardHeader>
              <CardTitle className="text-sm text-yellow-400">
                Recommendations ({cert.recommendations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {cert.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-yellow-300/70">
                    <span className="mt-0.5 shrink-0 text-yellow-500">→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* 6. Operator State */}
        <Card className="bg-gray-900 border-white/10 text-white">
          <CardHeader>
            <CardTitle className="text-sm">Operator State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-white/40 mb-2">Runtime</div>
              <Badge
                className={
                  operatorState.runtimePaused
                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                    : "bg-green-500/20 text-green-400 border-green-500/30"
                }
              >
                {operatorState.runtimePaused ? "PAUSED" : "running"}
              </Badge>
            </div>

            <div>
              <div className="text-xs text-white/40 mb-2">
                Disabled Agents ({disabledAgents.length})
              </div>
              {disabledAgents.length === 0 ? (
                <span className="text-white/25 text-xs">None</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {disabledAgents.map((agent) => (
                    <Badge
                      key={agent}
                      className="bg-red-500/20 text-red-400 border-red-500/30 font-mono text-xs"
                    >
                      {agent}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-white/40 mb-2">
                Disabled Event Types ({disabledEventTypes.length})
              </div>
              {disabledEventTypes.length === 0 ? (
                <span className="text-white/25 text-xs">None</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {disabledEventTypes.map((et) => (
                    <Badge
                      key={et}
                      className="bg-orange-500/20 text-orange-400 border-orange-500/30 font-mono text-xs"
                    >
                      {et}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 7. Footer */}
        <div className="flex items-center justify-between text-xs text-white/25 pt-2 border-t border-white/5">
          <span>Last checked: {checkedAt}</span>
          <Link
            href="/admin/mission-control"
            className="text-[#CCFF00]/60 hover:text-[#CCFF00]"
          >
            Go to Mission Control →
          </Link>
        </div>
      </div>
    </div>
  );
}
