import { cn } from "@/lib/utils";
import type { AgentName } from "@/types";

const AGENT_COLORS: Record<AgentName, string> = {
  ALICE: "bg-blue-100 text-blue-700 border-blue-200",
  MAX: "bg-purple-100 text-purple-700 border-purple-200",
  QUINN: "bg-green-100 text-green-700 border-green-200",
  NOVA: "bg-orange-100 text-orange-700 border-orange-200",
  REX: "bg-red-100 text-red-700 border-red-200",
  IVY: "bg-pink-100 text-pink-700 border-pink-200",
  FINN: "bg-teal-100 text-teal-700 border-teal-200",
  LENA: "bg-violet-100 text-violet-700 border-violet-200",
  TESS: "bg-yellow-100 text-yellow-700 border-yellow-200",
  GABRIEL: "bg-slate-100 text-slate-700 border-slate-200",
};

const AGENT_ROLES: Record<AgentName, string> = {
  ALICE: "Intake",
  MAX: "Dispatch",
  QUINN: "Pricing",
  NOVA: "Workflow",
  REX: "Quality",
  IVY: "Disputes",
  FINN: "Finance",
  LENA: "Retention",
  TESS: "Territory",
  GABRIEL: "Compliance",
};

interface AgentBadgeProps {
  agent: AgentName;
  showRole?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function AgentBadge({ agent, showRole = false, size = "sm", className }: AgentBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        AGENT_COLORS[agent],
        className
      )}
    >
      {agent}
      {showRole && <span className="opacity-60 font-normal">· {AGENT_ROLES[agent]}</span>}
    </span>
  );
}
