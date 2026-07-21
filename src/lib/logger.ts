export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  agentName?: string;
  eventType?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private context: LogContext = {};

  withContext(ctx: LogContext): Logger {
    const child = new Logger();
    child.context = { ...this.context, ...ctx };
    return child;
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...(data != null ? { data } : {}),
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  debug(message: string, data?: unknown): void { this.write("debug", message, data); }
  info(message: string, data?: unknown): void { this.write("info", message, data); }
  warn(message: string, data?: unknown): void { this.write("warn", message, data); }
  error(message: string, data?: unknown): void { this.write("error", message, data); }
}

export const logger = new Logger();
export function createLogger(ctx: LogContext): Logger { return logger.withContext(ctx); }
