import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { getTenantId } from "@/lib/tenancy";
import { generateEnterpriseCertification } from "@/lib/certification/enterprise-report";
import { isRuntimePaused } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-400";
  if (score >= 75) return "text-yellow-400";
  if (score >= 60) return "text-orange-400";
  return "text-red-400";
}

function scoreBar(score: number): string {
  if (score >= 90) return "bg-green-500";
  if (score >= 75) return "bg-yellow-500";
  if (score >= 60) return "bg-orange-500";
  return "bg-red-500";
}

function levelBadgeVariant(level: string): "success" | "warning" | "destructive" | "secondary" {
  if (level === "enterprise" || level === "premium") return "success";
  if (level === "standard") return "warning";
  return "destructive";
}

export default async function CertificationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  getTenantId(profile);

  const cert = generateEnterpriseCertification();
  const paused = isRuntimePaused();
  const circuits = getAllCircuits();
  const openCircuits = circuits.filter(c => c.state === "open");
  const closedCircuits = circuits.filter(c => c.state === "closed");
  const halfOpenCircuits = circuits.filter(c => c.state === "half-open");

  const sections = [
    { key: "architecture", label: "Architecture", score: cert.sections.architecture.score, detail: cert.sections.architecture.compliant ? "Compliant" : "Non-compliant" },
    { key: "topology", label: "Topology", score: cert.sections.topology.score, detail: cert.sections.topology.valid ? "Valid" : "Invalid" },
    { key: "readiness", label: "Operational Readiness", score: cert.sections.readiness.score, detail: cert.sections.readiness.level },
    { key: "compliance", label: "Compliance", score: cert.sections.compliance.score, detail: cert.sections.compliance.compliant ? "Compliant" : "Non-compliant" },
    { key: "resilience", label: "Resilience", score: cert.sections.resilience.score, detail: `${closedCircuits.length}/${closedCircuits.length + openCircuits.length + halfOpenCircuits.length} circuits healthy` },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Production Certification</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/executive" className="text-white/40 hover:text-white">Executive OS</Link>
          <Link href="/admin/mission-control" className="text-white/40 hover:text-white">Mission Control</Link>
          <Link href="/admin/agents" className="text-white/40 hover:text-white">Agents</Link>
          <Link href="/admin/launch-readiness" className="text-white/40 hover:text-white">Launch Readiness</Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Production Certification</h1>
            <p className="text-white/40 text-sm mt-1">Enterprise-grade operational validation · Generated {new Date(cert.generatedAt).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <div className={`text-5xl font-black ${scoreColor(cert.overallScore)}`}>{cert.overallScore}</div>
            <Badge variant={levelBadgeVariant(cert.certificationLevel)} className="mt-1 text-xs uppercase tracking-wider">
              {cert.certificationLevel}
            </Badge>
          </div>
        </div>

        {/* Runtime status bar */}
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${paused ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
          <div className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-red-500" : "bg-green-500"}`} />
          <span className="text-sm font-medium">{paused ? "Runtime PAUSED — automation suspended" : "Runtime ACTIVE — all systems operational"}</span>
          <div className="ml-auto flex gap-4 text-xs text-white/40">
            <span>{openCircuits.length} circuit{openCircuits.length !== 1 ? "s" : ""} open</span>
            <span>{closedCircuits.length} closed</span>
            {halfOpenCircuits.length > 0 && <span>{halfOpenCircuits.length} half-open</span>}
          </div>
        </div>

        {/* Section scores */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {sections.map(s => (
            <Card key={s.key} className="bg-gray-900 border-white/10">
              <CardContent className="pt-4">
                <div className="flex items-end justify-between mb-2">
                  <span className={`text-3xl font-black ${scoreColor(s.score)}`}>{s.score}</span>
                  <span className="text-white/30 text-xs">/100</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1 mb-2">
                  <div className={`h-1 rounded-full ${scoreBar(s.score)}`} style={{ width: `${s.score}%` }} />
                </div>
                <p className="text-white/70 text-xs font-medium">{s.label}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{s.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Critical issues */}
          <Card className="bg-gray-900 border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm font-semibold">Production Blockers</CardTitle>
                {cert.criticalIssues.length > 0
                  ? <Badge variant="destructive" className="text-xs">{cert.criticalIssues.length}</Badge>
                  : <Badge variant="success" className="text-xs">Clear</Badge>
                }
              </div>
            </CardHeader>
            <CardContent>
              {cert.criticalIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm">No critical blockers detected</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {cert.criticalIssues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                      <p className="text-red-300 text-xs">{issue}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="bg-gray-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-semibold">Recommended Actions</CardTitle>
            </CardHeader>
            <CardContent>
              {cert.recommendations.length === 0 ? (
                <p className="text-white/30 text-sm">No recommendations at this time</p>
              ) : (
                <div className="space-y-2">
                  {cert.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/5">
                      <span className="text-[#CCFF00] text-xs font-bold shrink-0 mt-0.5">{i + 1}.</span>
                      <p className="text-white/60 text-xs">{rec}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Circuit breaker status */}
        <Card className="bg-gray-900 border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm font-semibold">Circuit Breaker Status</CardTitle>
              <Badge variant="secondary" className="text-xs">{Object.keys(circuits).length} circuits</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {circuits.map(circuit => (
                <div key={circuit.key} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
                  circuit.state === "open" ? "bg-red-500/10 border-red-500/20" :
                  circuit.state === "half-open" ? "bg-yellow-500/10 border-yellow-500/20" :
                  "bg-green-500/10 border-green-500/20"
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    circuit.state === "open" ? "bg-red-500" :
                    circuit.state === "half-open" ? "bg-yellow-500" :
                    "bg-green-500"
                  }`} />
                  <span className="text-white/60 truncate font-mono">{circuit.key}</span>
                  {circuit.failureCount > 0 && (
                    <span className="ml-auto text-white/30 shrink-0">{circuit.failureCount}f</span>
                  )}
                </div>
              ))}
              {Object.keys(circuits).length === 0 && (
                <p className="text-white/30 text-sm col-span-4">No circuit breakers registered</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Certification summary */}
        <Card className={`border ${cert.certified ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
          <CardContent className="py-5 flex items-center gap-4">
            <div className={`text-4xl font-black ${cert.certified ? "text-green-400" : "text-red-400"}`}>
              {cert.certified ? "✓" : "✗"}
            </div>
            <div>
              <p className={`font-bold text-lg ${cert.certified ? "text-green-300" : "text-red-300"}`}>
                {cert.certified ? "Platform Certified for Production" : "Certification Not Achieved"}
              </p>
              <p className="text-white/40 text-sm">
                {cert.certified
                  ? `Achieved ${cert.certificationLevel} certification with a score of ${cert.overallScore}/100.`
                  : `Score ${cert.overallScore}/100 is below the 85-point certification threshold. Resolve blockers above.`
                }
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
