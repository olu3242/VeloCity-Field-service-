"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, SERVICE_CATEGORY_ICONS, formatDateTime } from "@/lib/utils";
import Link from "next/link";

type LiveJob = {
  id: string;
  title: string;
  category: string;
  status: string;
  city: string;
  state: string;
  created_at: string;
  urgency: string;
};

const ACTIVE_STATUSES = ["submitted", "awaiting_serviceability", "awaiting_match", "offer_sent", "accepted", "scheduled", "deposit_paid", "en_route", "arrived", "diagnosis_in_progress", "in_progress"];

export function DispatchLiveQueue({ initialJobs }: { initialJobs: LiveJob[] }) {
  const [jobs, setJobs] = useState<LiveJob[]>(initialJobs);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || supabaseUrl.includes("placeholder") || !supabaseAnonKey || supabaseAnonKey.includes("placeholder")) {
      return;
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

    const channel = supabase
      .channel("dispatch-live-queue")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "jobs",
        filter: `status=in.(${ACTIVE_STATUSES.join(",")})`,
      }, (payload) => {
        setLastUpdated(new Date());
        if (payload.eventType === "INSERT") {
          setJobs(prev => [payload.new as LiveJob, ...prev].slice(0, 25));
        } else if (payload.eventType === "UPDATE") {
          setJobs(prev => {
            const updated = prev.map(j => j.id === payload.new.id ? payload.new as LiveJob : j);
            return updated.filter(j => ACTIVE_STATUSES.includes(j.status));
          });
        } else if (payload.eventType === "DELETE") {
          setJobs(prev => prev.filter(j => j.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Live Jobs Queue</h2>
        <span className="text-xs text-white/40">Updated {lastUpdated.toLocaleTimeString()}</span>
      </div>
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-white/40">No active jobs in queue.</div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Link key={job.id} href={`/admin/jobs/${job.id}`}>
              <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/5 p-4 hover:border-[#CCFF00]/40 hover:bg-white/10 transition-all cursor-pointer">
                <span className="text-2xl">{(SERVICE_CATEGORY_ICONS as Record<string, string>)[job.category] ?? "🔧"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{job.title}</div>
                  <div className="text-xs text-white/40">{job.city}, {job.state} · {formatDateTime(job.created_at)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {job.urgency === "emergency" && (
                    <span className="text-xs font-bold text-red-400 uppercase">🚨 Emergency</span>
                  )}
                  <Badge className={(JOB_STATUS_COLORS as Record<string, string>)[job.status] ?? ""}>
                    {(JOB_STATUS_LABELS as Record<string, string>)[job.status] ?? job.status}
                  </Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
