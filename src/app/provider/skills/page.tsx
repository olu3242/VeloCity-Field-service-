import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";

const TIER_ORDER = ["novice", "competent", "proficient", "expert"] as const;
type SkillTier = (typeof TIER_ORDER)[number];
const CERT_ORDER = ["bronze", "silver", "gold", "elite"] as const;

function tierColor(tier: SkillTier) {
  if (tier === "expert") return "text-[#CCFF00]";
  if (tier === "proficient") return "text-blue-400";
  if (tier === "competent") return "text-green-400";
  return "text-white/40";
}

function tierBadge(tier: SkillTier) {
  if (tier === "expert") return "bg-[#CCFF00]/20 text-[#CCFF00] border-[#CCFF00]/30";
  if (tier === "proficient") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (tier === "competent") return "bg-green-500/20 text-green-400 border-green-500/30";
  return "bg-white/10 text-white/40 border-white/10";
}

function certBadge(tier: string) {
  if (tier === "elite") return "bg-[#CCFF00]/20 text-[#CCFF00] border-[#CCFF00]/30";
  if (tier === "gold") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (tier === "silver") return "bg-blue-400/20 text-blue-300 border-blue-400/30";
  return "bg-orange-500/20 text-orange-400 border-orange-500/30";
}

function progressBar(score: number) {
  const pct = Math.min(score, 100);
  return (
    <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-[#CCFF00]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default async function ProviderSkillsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "provider") redirect("/dashboard");

  const { data: providerRow } = await supabase
    .from("providers")
    .select("id, status, trust_score")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!providerRow) redirect("/provider/apply");

  const adminClient = await createAdminClient();

  const [skillsResult, progressResult, certsResult] = await Promise.all([
    adminClient
      .from("provider_skills")
      .select("id, service_type_id, proficiency_score, skill_tier, completed_jobs_count, average_rating, cancellation_rate, last_computed_at, service_types(name)")
      .eq("provider_id", providerRow.id)
      .order("proficiency_score", { ascending: false }),
    adminClient
      .from("provider_skill_progress")
      .select("service_type_id, current_tier, next_tier, jobs_completed, jobs_required_for_next, rating_required_for_next, gap_summary, computed_at")
      .eq("provider_id", providerRow.id),
    adminClient
      .from("provider_certifications")
      .select("id, category, tier, is_active, awarded_at")
      .eq("provider_id", providerRow.id)
      .eq("is_active", true)
      .order("awarded_at", { ascending: false }),
  ]);

  type Skill = {
    id: string; service_type_id: string; proficiency_score: number; skill_tier: SkillTier;
    completed_jobs_count: number; average_rating: number | null; cancellation_rate: number;
    last_computed_at: string | null; service_types: { name: string } | null;
  };
  type Progress = {
    service_type_id: string; current_tier: string; next_tier: string | null;
    jobs_completed: number; jobs_required_for_next: number | null;
    rating_required_for_next: number | null; gap_summary: string | null;
  };
  type Cert = { id: string; category: string; tier: string; is_active: boolean; awarded_at: string };

  const skills = (skillsResult.data ?? []) as unknown as Skill[];
  const progressRows = (progressResult.data ?? []) as Progress[];
  const certs = (certsResult.data ?? []) as Cert[];

  const progressByServiceType: Record<string, Progress> = {};
  for (const p of progressRows) {
    progressByServiceType[p.service_type_id] = p;
  }

  const activeCerts = certs.filter((c) => c.is_active);
  const topTier = skills.find((s) => s.skill_tier === "expert")?.skill_tier ?? skills[0]?.skill_tier ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-[#CCFF00]">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <Link href="/provider/dashboard" className="text-sm text-white/60 hover:text-white">Dashboard</Link>
          <Link href="/provider/earnings" className="text-sm text-white/60 hover:text-white">Earnings</Link>
          <span className="text-sm text-[#CCFF00]">Skills</span>
          <Link href="/provider/notifications" className="text-sm text-white/60 hover:text-white">Notifications</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Skills & Certifications</h1>
            <p className="text-white/40 text-sm mt-1">
              Evidence-backed proficiency across your service types
            </p>
          </div>
          {topTier && (
            <Badge className={tierBadge(topTier as SkillTier)}>
              Top tier: {topTier}
            </Badge>
          )}
        </div>

        {/* Certifications */}
        {activeCerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-3">
              Certifications ({activeCerts.length})
            </h2>
            <div className="flex flex-wrap gap-3">
              {activeCerts.map((c) => (
                <div key={c.id} className="rounded-lg border border-white/10 bg-gray-900 px-4 py-3 flex items-center gap-3">
                  <div>
                    <div className="text-sm font-medium capitalize">{c.category.replace(/_/g, " ")}</div>
                    <div className="text-xs text-white/40 mt-0.5">
                      Awarded {new Date(c.awarded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <Badge className={certBadge(c.tier)}>{c.tier}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills grid */}
        {skills.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-gray-900 py-16 text-center text-white/30 text-sm">
            No skill data yet. Skills are computed automatically as you complete jobs and receive ratings.
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40 mb-3">
              Service Proficiency ({skills.length} service type{skills.length !== 1 ? "s" : ""})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {skills.map((skill) => {
                const prog = progressByServiceType[skill.service_type_id];
                const tierIdx = TIER_ORDER.indexOf(skill.skill_tier as SkillTier);
                return (
                  <div key={skill.id} className="rounded-lg border border-white/10 bg-gray-900 p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="font-medium text-sm">
                        {skill.service_types?.name ?? skill.service_type_id}
                      </div>
                      <Badge className={tierBadge(skill.skill_tier as SkillTier)}>
                        {skill.skill_tier}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                      <div>
                        <div className="text-white/40 mb-0.5">Score</div>
                        <div className={`font-bold text-lg ${tierColor(skill.skill_tier as SkillTier)}`}>
                          {skill.proficiency_score}
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40 mb-0.5">Jobs</div>
                        <div className="font-semibold">{skill.completed_jobs_count}</div>
                      </div>
                      <div>
                        <div className="text-white/40 mb-0.5">Avg Rating</div>
                        <div className="font-semibold">
                          {skill.average_rating !== null ? `${skill.average_rating} ★` : "—"}
                        </div>
                      </div>
                    </div>

                    {progressBar(skill.proficiency_score)}

                    {/* Tier progress indicators */}
                    <div className="flex justify-between mt-1 text-[10px] text-white/20">
                      {TIER_ORDER.map((t, i) => (
                        <span key={t} className={i <= tierIdx ? "text-white/50" : ""}>{t}</span>
                      ))}
                    </div>

                    {prog?.gap_summary && prog.next_tier && (
                      <div className="mt-3 rounded-md bg-white/5 px-3 py-2 text-xs text-white/50">
                        <span className="text-white/70 font-medium">Next: {prog.next_tier}</span>
                        {" — "}{prog.gap_summary}
                      </div>
                    )}

                    {skill.cancellation_rate > 0.05 && (
                      <div className="mt-2 text-xs text-red-400">
                        Cancellation rate {(skill.cancellation_rate * 100).toFixed(1)}% — affects score
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-6 text-xs text-white/20 text-center">
          Scores computed automatically from completed jobs, ratings, and offer history. Last updated: {
            skills[0]?.last_computed_at
              ? new Date(skills[0].last_computed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "never"
          }
        </div>
      </div>
    </div>
  );
}
