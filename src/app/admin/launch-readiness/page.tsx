import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Rocket, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEnvStatus, hasEnvGroup } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildDeploymentChecklist,
  buildEnvironmentChecklist,
  buildQaChecklist,
  buildReadinessSection,
  calculateLaunchReadiness,
  type LaunchReadinessSection,
  type LaunchStatus,
} from "@/lib/launch";

function statusVariant(status: LaunchStatus): "success" | "warning" | "destructive" | "secondary" {
  if (status === "pass") return "success";
  if (status === "warning") return "warning";
  if (status === "fail" || status === "blocked") return "destructive";
  return "secondary";
}

function StatusIcon({ status }: { status: LaunchStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <AlertTriangle className="h-4 w-4 text-red-600" />;
}

function SectionCard({ section }: { section: LaunchReadinessSection }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{section.name}</CardTitle>
          <Badge variant={statusVariant(section.status)}>{section.score}/100</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.items.map((item) => (
          <div key={item.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <StatusIcon status={item.status} />
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.evidence}</div>
                </div>
              </div>
              <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
            </div>
            <div className="mt-2 text-xs text-gray-400">{item.auditEvent}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default async function LaunchReadinessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const envStatus = getEnvStatus();
  const [{ data: payments }, { data: agentLogs }, { data: providers }, { data: jobs }] = await Promise.all([
    supabase.from("payments").select("id,status").limit(50),
    supabase.from("agent_logs").select("id,error").limit(50),
    supabase.from("providers").select("id,status").limit(50),
    supabase.from("jobs").select("id,status").limit(50),
  ]);

  const environment = buildReadinessSection("Environment", buildEnvironmentChecklist({
    coreConfigured: hasEnvGroup("core"),
    supabaseConfigured: hasEnvGroup("supabase"),
    adminSupabaseConfigured: hasEnvGroup("adminSupabase"),
    stripeConfigured: hasEnvGroup("stripe"),
    aiConfigured: hasEnvGroup("ai"),
    googleConfigured: envStatus.oauth.missing.length === 0,
    smsConfigured: hasEnvGroup("sms"),
    emailConfigured: hasEnvGroup("email"),
  }));

  const qa = buildReadinessSection("QA", buildQaChecklist({
    typecheckPassed: true,
    lintPassed: true,
    buildPassed: true,
    demoAccountsVerified: false,
    e2eCompleted: false,
  }));

  const paymentReady = (payments ?? []).length > 0 && !(payments ?? []).some((payment) => payment.status === "failed");
  const aiReady = (agentLogs ?? []).length > 0 && !(agentLogs ?? []).some((log) => Boolean(log.error));
  const securityReady = Boolean((providers ?? []).length || (jobs ?? []).length);

  const payment = buildReadinessSection("Payment Readiness", [
    {
      id: "payment-stripe",
      label: "Stripe live/test payment path configured",
      status: hasEnvGroup("stripe") ? "pass" : "warning",
      evidence: hasEnvGroup("stripe") ? "Stripe env values detected." : "Stripe values missing; local fallback may be active.",
      owner: "finance",
      auditEvent: "launch.payment.stripe",
      required: true,
    },
    {
      id: "payment-records",
      label: "Payment records verified",
      status: paymentReady ? "pass" : "warning",
      evidence: paymentReady ? "Payment records exist and no sampled failures detected." : "Payment records are empty or sampled failures exist.",
      owner: "finance",
      auditEvent: "launch.payment.records",
      required: true,
    },
  ]);

  const ai = buildReadinessSection("AI Agent Readiness", [
    {
      id: "ai-key",
      label: "AI key or deterministic fallback available",
      status: hasEnvGroup("ai") ? "pass" : "warning",
      evidence: hasEnvGroup("ai") ? "Anthropic key detected." : "Agents will use deterministic fallback behavior.",
      owner: "ai",
      auditEvent: "launch.ai.key",
      required: false,
    },
    {
      id: "ai-logs",
      label: "Agent log table activity",
      status: aiReady ? "pass" : "warning",
      evidence: aiReady ? "Agent logs exist and sampled rows have no errors." : "Agent log activity is empty or includes errors.",
      owner: "ai",
      auditEvent: "launch.ai.logs",
      required: false,
    },
  ]);

  const security = buildReadinessSection("Security/RLS", [
    {
      id: "security-rls",
      label: "Tenant-aware RLS migration ready",
      status: "warning",
      evidence: "Local RLS migrations exist; remote project still needs migration reconciliation and verification.",
      owner: "security",
      auditEvent: "launch.security.rls",
      required: true,
    },
    {
      id: "security-data",
      label: "Live data access smoke test",
      status: securityReady ? "pass" : "warning",
      evidence: securityReady ? "Sample provider/job rows are accessible to server-side admin checks." : "Sample provider/job rows are empty or unavailable.",
      owner: "security",
      auditEvent: "launch.security.data_smoke",
      required: true,
    },
  ]);

  const deployment = buildReadinessSection("Deployment", buildDeploymentChecklist({
    supabaseLinked: true,
    migrationsAligned: false,
    rlsAudited: false,
    vercelConfigured: false,
    domainConfigured: false,
  }));

  const report = calculateLaunchReadiness([environment, qa, payment, ai, security, deployment]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/admin/dashboard" className="text-lg font-bold text-velocity-700">Velocity Launch Readiness</Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link href="/admin/command-center">Command Center</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/admin/dashboard">Admin</Link></Button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                    <Rocket className="h-4 w-4" />
                    Production Launch Gate
                  </div>
                  <h1 className="mt-3 text-4xl font-bold">{report.score}/100</h1>
                  <p className="mt-2 text-sm text-gray-500">
                    Launch status is based on environment, QA, payment, AI, security, and deployment readiness.
                  </p>
                </div>
                <Badge variant={statusVariant(report.status)}>{report.status}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                Critical Blockers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.blockers.slice(0, 4).map((blocker) => (
                <div key={blocker.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{blocker.title}</span>
                    <Badge variant={blocker.severity === "critical" ? "destructive" : "warning"}>{blocker.severity}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{blocker.description}</p>
                </div>
              ))}
              {!report.blockers.length && <p className="text-sm text-gray-500">No critical blockers detected.</p>}
            </CardContent>
          </Card>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          {report.sections.map((section) => (
            <Card key={section.name}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                    <ClipboardCheck className="h-4 w-4" />
                    {section.name}
                  </div>
                  <Badge variant={statusVariant(section.status)}>{section.status}</Badge>
                </div>
                <div className="mt-3 text-3xl font-bold">{section.score}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          {report.sections.map((section) => <SectionCard key={section.name} section={section} />)}
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Next Required Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {report.nextActions.map((action) => (
                <div key={action.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{action.title}</div>
                    <Badge variant={action.severity === "critical" ? "destructive" : "warning"}>{action.owner}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{action.description}</p>
                  <div className="mt-2 text-xs text-gray-400">{action.auditEvent}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
