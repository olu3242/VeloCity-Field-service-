"use client";

import { toWorkstreamError } from "@/lib/workstream/errors";
import type { WorkstreamRuntimeState } from "@/lib/workstream/types";

interface WorkstreamErrorDisplayProps {
  workstream: string;
  error: unknown;
  state: WorkstreamRuntimeState;
  onRetry?: () => void;
}

// Renders the enterprise error format from Phase 4 of the WRF:
// title, status label, error code, HTTP status, dependency, retry, correlation ID.
// Generic "Something went wrong" messages are forbidden — every failure is named.
export function WorkstreamErrorDisplay({
  workstream,
  error,
  state,
  onRetry,
}: WorkstreamErrorDisplayProps) {
  const wsError = toWorkstreamError(error, state.correlationId);
  const p = wsError.toPayload();

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/60 p-6 max-w-2xl"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <span className="text-xl mt-0.5 shrink-0">⚠</span>
        <div>
          <h3 className="font-semibold text-red-900 dark:text-red-100 text-base leading-snug">
            {p.title}
          </h3>
          <p className="text-red-600 dark:text-red-400 text-sm mt-0.5">{p.statusLabel}</p>
        </div>
      </div>

      {/* Diagnostic fields */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-5 font-mono">
        <div className="col-span-2">
          <dt className="text-red-400 uppercase tracking-wide text-[10px] mb-0.5">Error</dt>
          <dd className="text-red-800 dark:text-red-200 font-semibold">{p.code}</dd>
        </div>
        <div>
          <dt className="text-red-400 uppercase tracking-wide text-[10px] mb-0.5">HTTP</dt>
          <dd className="text-red-800 dark:text-red-200">{p.httpStatus}</dd>
        </div>
        <div>
          <dt className="text-red-400 uppercase tracking-wide text-[10px] mb-0.5">Workstream</dt>
          <dd className="text-red-800 dark:text-red-200">{workstream}</dd>
        </div>
        {p.dependency && (
          <div className="col-span-2">
            <dt className="text-red-400 uppercase tracking-wide text-[10px] mb-0.5">
              Failing Dependency
            </dt>
            <dd className="text-red-800 dark:text-red-200">{p.dependency}</dd>
          </div>
        )}
        <div>
          <dt className="text-red-400 uppercase tracking-wide text-[10px] mb-0.5">Stage</dt>
          <dd className="text-red-800 dark:text-red-200">{p.stage}</dd>
        </div>
        <div>
          <dt className="text-red-400 uppercase tracking-wide text-[10px] mb-0.5">Retry</dt>
          <dd className="text-red-800 dark:text-red-200">
            {p.retryable ? "Automatic" : "Manual"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-red-400 uppercase tracking-wide text-[10px] mb-0.5">
            Correlation
          </dt>
          <dd className="text-red-700 dark:text-red-300 truncate">{p.correlationId}</dd>
        </div>
      </dl>

      {/* Suggested actions */}
      {p.suggestedActions.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wide text-red-500 dark:text-red-400 font-semibold mb-2">
            Suggested Actions
          </p>
          <div className="flex flex-wrap gap-2">
            {p.suggestedActions.map((action) => {
              if (action === "Retry" && onRetry) {
                return (
                  <button
                    key="retry"
                    onClick={onRetry}
                    className="px-3 py-1 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 font-medium transition-colors"
                  >
                    Retry
                  </button>
                );
              }
              if (action === "Open Diagnostics") {
                return (
                  <a
                    key="diagnostics"
                    href={`/admin/runtime/workstreams?correlation=${p.correlationId}`}
                    className="px-3 py-1 text-xs rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                  >
                    Open Diagnostics
                  </a>
                );
              }
              return (
                <span
                  key={action}
                  className="px-3 py-1 text-xs rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
                >
                  {action}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-red-300 dark:text-red-600 font-mono">{p.timestamp}</p>
    </div>
  );
}
