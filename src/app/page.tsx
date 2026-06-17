import { getAdminClient } from "@/lib/supabase/admin";
import { hasEnvGroup } from "@/lib/env";
import { LandingPage, type LandingStats, type LandingTestimonial } from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

const EMPTY_STATS: LandingStats = {
  activeJobsToday: 0,
  completedJobs: 0,
  providerCount: 0,
  avgRating: null,
  reviewCount: 0,
};

export default async function HomePage() {
  if (!hasEnvGroup("supabase") || !hasEnvGroup("adminSupabase")) {
    return <LandingPage stats={EMPTY_STATS} testimonials={[]} />;
  }

  const db = getAdminClient();

  const [
    { count: activeJobsToday },
    { count: completedJobs },
    { count: providerCount },
    { data: reviews },
  ] = await Promise.all([
    db
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .not("status", "in", '("draft","completed","closed","cancelled","expired","refunded")')
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    db.from("jobs").select("*", { count: "exact", head: true }).in("status", ["completed", "closed"]),
    db.from("providers").select("*", { count: "exact", head: true }).eq("status", "approved"),
    db
      .from("reviews")
      .select("rating, comment, created_at, profiles!reviews_reviewer_id_fkey(full_name), jobs(category)")
      .eq("is_public", true)
      .not("comment", "is", null)
      .neq("comment", "")
      .gte("rating", 4)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const ratingAgg = await db.from("reviews").select("rating").eq("is_public", true);
  const ratings = ratingAgg.data ?? [];
  const avgRating = ratings.length
    ? ratings.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / ratings.length
    : null;

  const stats: LandingStats = {
    activeJobsToday: activeJobsToday ?? 0,
    completedJobs: completedJobs ?? 0,
    providerCount: providerCount ?? 0,
    avgRating,
    reviewCount: ratings.length,
  };

  const testimonials: LandingTestimonial[] = (reviews ?? [])
    .map((r) => {
      const profile = r.profiles as unknown as { full_name?: string } | null;
      const job = r.jobs as unknown as { category?: string } | null;
      if (!profile?.full_name || !r.comment) return null;
      const [firstName, lastInitial] = profile.full_name.split(" ");
      return {
        quote: r.comment as string,
        rating: r.rating as number,
        author: `${firstName} ${lastInitial ? lastInitial[0] + "." : ""}`.trim(),
        category: job?.category ?? "Service",
      };
    })
    .filter((t): t is LandingTestimonial => t !== null);

  return <LandingPage stats={stats} testimonials={testimonials} />;
}
