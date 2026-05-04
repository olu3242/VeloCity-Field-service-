import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/utils";
import type { JobStatus } from "@/types";

interface JobStatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  return (
    <Badge className={`${JOB_STATUS_COLORS[status]} ${className ?? ""}`}>
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}
