"use client";

// WorkstreamRuntime — the shared client-side execution wrapper.
// Every interactive workstream renders inside this component, which enforces
// the full lifecycle: authenticate → resolve tenant → load dependencies →
// execute → observe → recover. No workstream manages its own loading/error
// state independently; all operational concerns are handled here.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { generateRequestId } from "@/lib/tracing/span";
import { WorkstreamErrorDisplay } from "./WorkstreamErrorDisplay";
import {
  loadWorkstreamState,
  saveWorkstreamState,
} from "@/lib/workstream/session-continuity";
import type { WorkstreamRuntimeState } from "@/lib/workstream/types";

// ── Runtime context ───────────────────────────────────────────────────────────

interface WorkstreamRuntimeContextValue {
  state: WorkstreamRuntimeState;
  retry: () => void;
  refresh: () => void;
}

const WorkstreamRuntimeContext =
  createContext<WorkstreamRuntimeContextValue | null>(null);

export function useWorkstreamRuntime(): WorkstreamRuntimeContextValue {
  const ctx = useContext(WorkstreamRuntimeContext);
  if (!ctx)
    throw new Error(
      "useWorkstreamRuntime must be called inside <WorkstreamRuntime>",
    );
  return ctx;
}

// ── Component ────────────────────────────────────────────────────────────────

export interface WorkstreamRuntimeProps {
  /** Logical workstream name (used in error display and telemetry) */
  workstream: string;
  /** Permissions required — used as a hint; actual enforcement is server-side */
  permissions?: string[];
  /** Async initializer called on mount and on retry. Throw to trigger error state. */
  loader?: () => Promise<unknown>;
  children: React.ReactNode;
  /** Shown in degraded mode instead of the error display */
  fallback?: React.ReactNode;
  /** sessionStorage key for state continuity across page refreshes */
  sessionKey?: string;
  /** Maximum automatic retries before switching to error display */
  maxRetries?: number;
  /** Custom loading label for screen readers */
  loadingLabel?: string;
}

type Phase = "loading" | "ready" | "error" | "degraded";

function emptyState(workstream: string): WorkstreamRuntimeState {
  return {
    workstream,
    status: "initializing",
    correlationId: "",
    requestId: "",
    tenantId: null,
    franchiseId: null,
    organizationId: null,
    workflowId: null,
    latency: 0,
    retryCount: 0,
    dependencies: [],
    warnings: [],
    errors: [],
    lastSuccess: null,
    health: "healthy",
    degraded: false,
    recoverable: true,
  };
}

export function WorkstreamRuntime({
  workstream,
  permissions: _permissions,
  loader,
  children,
  fallback,
  sessionKey,
  maxRetries = 3,
  loadingLabel,
}: WorkstreamRuntimeProps) {
  const [phase, setPhase] = useState<Phase>(loader ? "loading" : "ready");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<WorkstreamRuntimeState>(() =>
    emptyState(workstream),
  );

  const execute = useCallback(async () => {
    if (!loader) {
      setPhase("ready");
      return;
    }
    setPhase("loading");
    const t0 = Date.now();
    const correlationId = generateRequestId();
    const requestId = generateRequestId();

    if (sessionKey) loadWorkstreamState(sessionKey);

    try {
      await loader();
      const latency = Date.now() - t0;
      const now = new Date().toISOString();

      setState((prev) => ({
        ...prev,
        status: "ready",
        health: "healthy",
        correlationId,
        requestId,
        latency,
        degraded: false,
        retryCount,
        lastSuccess: now,
      }));

      if (sessionKey) {
        saveWorkstreamState(sessionKey, { lastSuccess: now, latency }, null, false);
      }

      setPhase("ready");
      setLoadError(null);
    } catch (err) {
      const latency = Date.now() - t0;
      const canRetry = retryCount < maxRetries;

      setState((prev) => ({
        ...prev,
        status: "failed",
        health: canRetry ? "degraded" : "offline",
        correlationId,
        requestId,
        latency,
        degraded: true,
        recoverable: canRetry,
        retryCount,
      }));

      setLoadError(err);
      setPhase(canRetry && fallback ? "degraded" : "error");
    }
  }, [loader, retryCount, maxRetries, sessionKey, fallback]);

  useEffect(() => {
    execute();
  }, [execute]);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const refresh = useCallback(() => {
    execute();
  }, [execute]);

  if (phase === "loading") {
    return <LoadingShell workstream={workstream} label={loadingLabel} />;
  }

  if (phase === "error") {
    return (
      <WorkstreamErrorDisplay
        workstream={workstream}
        error={loadError}
        state={state}
        onRetry={state.recoverable ? retry : undefined}
      />
    );
  }

  if (phase === "degraded" && fallback) {
    return (
      <div className="space-y-2">
        <DegradedBanner workstream={workstream} onRetry={retry} />
        {fallback}
      </div>
    );
  }

  return (
    <WorkstreamRuntimeContext.Provider value={{ state, retry, refresh }}>
      {children}
    </WorkstreamRuntimeContext.Provider>
  );
}

// ── Internal sub-components ───────────────────────────────────────────────────

function LoadingShell({
  workstream,
  label,
}: {
  workstream: string;
  label?: string;
}) {
  return (
    <div
      className="animate-pulse space-y-3 p-4"
      role="status"
      aria-label={label ?? `Loading ${workstream}…`}
    >
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      <span className="sr-only">{label ?? `Loading ${workstream}…`}</span>
    </div>
  );
}

function DegradedBanner({
  workstream,
  onRetry,
}: {
  workstream: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/50 px-4 py-2 text-sm">
      <span className="text-yellow-600 dark:text-yellow-400 shrink-0">⚠</span>
      <span className="text-yellow-800 dark:text-yellow-200 flex-1">
        <strong>{workstream}</strong> is running in degraded mode — some
        features may be unavailable.
      </span>
      <button
        onClick={onRetry}
        className="text-yellow-700 dark:text-yellow-400 hover:underline font-medium shrink-0"
      >
        Retry
      </button>
    </div>
  );
}
