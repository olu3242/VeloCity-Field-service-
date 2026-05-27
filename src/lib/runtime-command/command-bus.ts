/**
 * Command Bus — queues and tracks runtime commands.
 * In-memory singleton with rolling cap of 200 entries.
 */

const QUEUE_CAP = 200

export type CommandType =
  | "pause_runtime"
  | "resume_runtime"
  | "trigger_recovery"
  | "drain_queue"
  | "scale_workers"
  | "force_canary_rollback"
  | "snapshot_state"

export interface RuntimeCommand {
  id: string
  commandType: CommandType
  issuedBy: string
  tenantId?: string
  parameters: Record<string, unknown>
  status: "queued" | "executing" | "completed" | "failed" | "rejected"
  issuedAt: string
  executedAt?: string
  result?: string
}

const COMMAND_QUEUE: RuntimeCommand[] = []

function enforceCap(): void {
  while (COMMAND_QUEUE.length > QUEUE_CAP) COMMAND_QUEUE.shift()
}

export function issueCommand(
  commandType: CommandType,
  issuedBy: string,
  parameters?: Record<string, unknown>,
  tenantId?: string
): RuntimeCommand {
  const cmd: RuntimeCommand = {
    id: crypto.randomUUID(),
    commandType,
    issuedBy,
    tenantId,
    parameters: parameters ?? {},
    status: "queued",
    issuedAt: new Date().toISOString(),
  }
  COMMAND_QUEUE.push(cmd)
  enforceCap()
  return cmd
}

export function executeCommand(id: string): RuntimeCommand | undefined {
  const cmd = COMMAND_QUEUE.find((c) => c.id === id)
  if (!cmd) return undefined
  cmd.status = "executing"
  cmd.executedAt = new Date().toISOString()
  return cmd
}

export function completeCommand(id: string, result: string): void {
  const cmd = COMMAND_QUEUE.find((c) => c.id === id)
  if (!cmd) return
  cmd.status = "completed"
  cmd.result = result
}

export function failCommand(id: string, reason: string): void {
  const cmd = COMMAND_QUEUE.find((c) => c.id === id)
  if (!cmd) return
  cmd.status = "failed"
  cmd.result = reason
}

export function getCommandHistory(limit = 50): RuntimeCommand[] {
  return COMMAND_QUEUE.slice(-limit)
}

export function getPendingCommands(): RuntimeCommand[] {
  return COMMAND_QUEUE.filter((c) => c.status === "queued")
}
