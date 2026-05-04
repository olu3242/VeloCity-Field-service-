"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { JobStatus, UserRole } from "@/types";

interface JobTransitionButtonProps {
  jobId: string;
  toStatus: JobStatus;
  label: string;
  variant?: "default" | "outline" | "destructive";
  requiresReason?: boolean;
  className?: string;
}

export function JobTransitionButton({
  jobId,
  toStatus,
  label,
  variant = "default",
  requiresReason = false,
  className,
}: JobTransitionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTransition() {
    let reason: string | undefined;
    if (requiresReason) {
      reason = window.prompt(`Reason for: ${label}`) ?? undefined;
      if (!reason) return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: toStatus, reason }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed");
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <Button
        variant={variant}
        disabled={loading}
        onClick={handleTransition}
        className={className}
      >
        {loading ? "..." : label}
      </Button>
    </div>
  );
}
