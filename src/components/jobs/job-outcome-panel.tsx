"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobOutcomeSnapshot } from "@/lib/outcomes";

interface JobOutcomePanelProps {
  jobId: string;
}

export function JobOutcomePanel({ jobId }: JobOutcomePanelProps) {
  const [outcome, setOutcome] = useState<JobOutcomeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/jobs/${jobId}/outcome`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { data?: JobOutcomeSnapshot; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error ?? "Outcome is unavailable.");
        setOutcome(body.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Outcome is unavailable.");
        }
      });

    return () => controller.abort();
  }, [jobId]);

  if (error) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-center gap-2 pt-6 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Outcome verification unavailable: {error}
        </CardContent>
      </Card>
    );
  }

  if (!outcome) {
    return (
      <Card aria-busy="true">
        <CardContent className="pt-6 text-sm text-gray-500">Verifying job outcome…</CardContent>
      </Card>
    );
  }

  const verdictVariant = outcome.verdict === "satisfied"
    ? "success"
    : outcome.verdict === "blocked" || outcome.verdict === "failed"
      ? "destructive"
      : "secondary";

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Verified Service Outcome</CardTitle>
          <Badge variant={verdictVariant}>{outcome.verdict.replaceAll("_", " ")}</Badge>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span className="capitalize">{outcome.stage.replaceAll("_", " ")}</span>
            <span>{outcome.progressPercent}% verified</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-velocity-600" style={{ width: `${outcome.progressPercent}%` }} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {outcome.checkpoints.map((checkpoint) => (
          <div key={checkpoint.id} className="flex items-start gap-3 rounded-md border p-3 text-sm">
            {checkpoint.satisfied ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            )}
            <div>
              <div className="font-medium">{checkpoint.label}</div>
              {!checkpoint.satisfied && checkpoint.blockingReason && (
                <div className="mt-0.5 text-xs text-gray-500">{checkpoint.blockingReason}</div>
              )}
            </div>
          </div>
        ))}
        {outcome.nextAction && (
          <div className="rounded-md bg-velocity-50 p-3 text-sm text-velocity-900">
            <span className="font-medium">Next action:</span> {outcome.nextAction}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

