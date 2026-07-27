// GET  /api/admin/runtime-command — control plane status, operational mode, command queue, audit trail
// POST /api/admin/runtime-command — issue_command | execute_command | complete_command | fail_command
//                                   | pause_runtime | resume_runtime | audit_command
// Admin-only.
//
// This is the platform's control plane. Command types that affect every tenant
// (pause_runtime, resume_runtime, drain_queue, scale_workers, force_canary_rollback,
// trigger_recovery) require super_admin. `issuedBy` is always taken from the authenticated
// session — never the request body — so the operator audit trail cannot be forged.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  issueCommand,
  executeCommand,
  completeCommand,
  failCommand,
  getCommandHistory,
  getPendingCommands,
  type CommandType,
  type RuntimeCommand,
} from "@/lib/runtime-command/command-bus";
import {
  getControlPlaneStatus,
  pauseRuntime,
  resumeRuntime,
  getOperationalMode,
} from "@/lib/runtime-command/control-plane";
import {
  auditCommand,
  getCommandAudit,
  getRecentAudit,
  getAuditByOperator,
} from "@/lib/runtime-command/audit-commander";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_COMMAND_TYPES: CommandType[] = [
  "pause_runtime", "resume_runtime", "trigger_recovery", "drain_queue",
  "scale_workers", "force_canary_rollback", "snapshot_state",
];

// Every command type except snapshot_state changes runtime behaviour for all tenants.
const PLATFORM_WIDE_COMMANDS = new Set<CommandType>([
  "pause_runtime", "resume_runtime", "trigger_recovery",
  "drain_queue", "scale_workers", "force_canary_rollback",
]);

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, userId: user.id };
}

// A command is visible if platform-level (no tenantId) or owned by this tenant.
function visible(cmd: RuntimeCommand, tenantId: string): boolean {
  return cmd.tenantId === undefined || cmd.tenantId === tenantId;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const url = new URL(request.url);
  const commandId = url.searchParams.get("commandId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  return NextResponse.json({
    controlPlane: {
      status: getControlPlaneStatus(),
      operationalMode: getOperationalMode(),
    },
    commands: {
      history: getCommandHistory(limit).filter((c) => visible(c, tenantId)),
      pending: getPendingCommands().filter((c) => visible(c, tenantId)),
    },
    audit: {
      // The audit trail records who issued platform-affecting commands — restricted
      // to super_admin since it spans every tenant's operators.
      ...(isSuperAdmin ? { recent: getRecentAudit(limit) } : {}),
      ...(commandId ? { forCommand: getCommandAudit(commandId) } : {}),
    },
    supportedCommandTypes: VALID_COMMAND_TYPES,
    platformWideCommandTypes: Array.from(PLATFORM_WIDE_COMMANDS),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const operatorId = auth.userId;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  // ── Runtime pause / resume ──────────────────────────────────────────────

  if (action === "pause_runtime" || action === "resume_runtime") {
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: `Forbidden — '${action}' halts or restarts the platform for every tenant and requires super_admin` },
        { status: 403 }
      );
    }

    if (action === "pause_runtime") {
      const { reason } = raw;
      if (typeof reason !== "string" || reason.trim() === "") {
        return NextResponse.json(
          { error: "reason required — a runtime pause must be justified in the audit trail" },
          { status: 400 }
        );
      }
      await pauseRuntime(operatorId, reason);
      auditCommand("pause_runtime", "pause_runtime", operatorId, reason);
    } else {
      await resumeRuntime(operatorId);
      auditCommand("resume_runtime", "resume_runtime", operatorId, "Runtime resume requested");
    }

    // pauseRuntime/resumeRuntime queue a command and emit an event; the actual
    // operator state flips in the event handler. Return the live control-plane
    // status so the caller sees the real outcome rather than assuming it applied.
    const status = getControlPlaneStatus();
    return NextResponse.json({
      action,
      status,
      operationalMode: getOperationalMode(),
      note: "Command issued and event emitted — runtimePaused reflects live operator state.",
      success: true,
    });
  }

  // ── Command bus ─────────────────────────────────────────────────────────

  if (action === "issue_command") {
    const { commandType, parameters } = raw;
    if (!VALID_COMMAND_TYPES.includes(commandType as CommandType)) {
      return NextResponse.json(
        { error: `commandType must be one of: ${VALID_COMMAND_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const typed = commandType as CommandType;
    if (PLATFORM_WIDE_COMMANDS.has(typed) && !isSuperAdmin) {
      return NextResponse.json(
        { error: `Forbidden — '${typed}' affects every tenant and requires super_admin` },
        { status: 403 }
      );
    }
    const cmd = issueCommand(
      typed,
      // issuedBy is the authenticated operator, never a body field.
      operatorId,
      parameters && typeof parameters === "object"
        ? (parameters as Record<string, unknown>)
        : {},
      // Platform-wide commands are recorded without a tenant; tenant-scoped ones
      // are pinned to the caller.
      PLATFORM_WIDE_COMMANDS.has(typed) ? undefined : tenantId
    );
    auditCommand(cmd.id, "issue", operatorId, `Issued ${typed}`, cmd.tenantId);
    return NextResponse.json({ action: "issue_command", command: cmd, success: true }, { status: 201 });
  }

  if (action === "execute_command" || action === "complete_command" || action === "fail_command") {
    const { id, result, reason } = raw;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // The bus mutators no-op on unknown ids and carry no tenant check, so the
    // command is resolved and ownership-checked from the visible history first.
    const cmd = getCommandHistory(200).find((c) => c.id === id);
    if (!cmd || !visible(cmd, tenantId)) {
      return NextResponse.json({ error: "Command not found for this tenant" }, { status: 404 });
    }
    if (cmd.tenantId === undefined && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — platform-level commands require super_admin" },
        { status: 403 }
      );
    }

    if (action === "execute_command") {
      if (cmd.status !== "queued") {
        return NextResponse.json(
          { error: `Command is '${cmd.status}' — only queued commands can be executed` },
          { status: 409 }
        );
      }
      const executing = executeCommand(id);
      auditCommand(id, "execute", operatorId, `Executing ${cmd.commandType}`, cmd.tenantId);
      return NextResponse.json({ action: "execute_command", command: executing ?? null, success: true });
    }

    if (cmd.status !== "executing") {
      return NextResponse.json(
        { error: `Command is '${cmd.status}' — only executing commands can be resolved` },
        { status: 409 }
      );
    }

    if (action === "complete_command") {
      if (typeof result !== "string" || result.trim() === "") {
        return NextResponse.json({ error: "result required" }, { status: 400 });
      }
      completeCommand(id, result);
      auditCommand(id, "complete", operatorId, result, cmd.tenantId);
    } else {
      if (typeof reason !== "string" || reason.trim() === "") {
        return NextResponse.json({ error: "reason required" }, { status: 400 });
      }
      failCommand(id, reason);
      auditCommand(id, "fail", operatorId, reason, cmd.tenantId);
    }

    return NextResponse.json({
      action,
      command: getCommandHistory(200).find((c) => c.id === id) ?? null,
      success: true,
    });
  }

  // ── Audit trail ─────────────────────────────────────────────────────────

  if (action === "audit_command") {
    const { commandId, byOperator } = raw;
    if (typeof byOperator === "string") {
      // Querying another operator's command history spans tenants.
      if (!isSuperAdmin && byOperator !== operatorId) {
        return NextResponse.json(
          { error: "Forbidden — querying another operator's audit trail requires super_admin" },
          { status: 403 }
        );
      }
      return NextResponse.json({
        action: "audit_command",
        entries: getAuditByOperator(byOperator),
        success: true,
      });
    }
    if (typeof commandId !== "string") {
      return NextResponse.json(
        { error: "commandId or byOperator required" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action: "audit_command",
      entries: getCommandAudit(commandId),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'issue_command', 'execute_command', 'complete_command', 'fail_command', 'pause_runtime', 'resume_runtime', or 'audit_command'.`,
    },
    { status: 400 }
  );
}
