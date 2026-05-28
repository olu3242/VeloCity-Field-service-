"use client";

import { VelocityButton, VelocityPanel } from "@/components/branding";

export default function AiError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-velocity-black p-6 text-velocity-white">
      <VelocityPanel className="max-w-md text-center">
        <h1 className="font-display text-4xl uppercase tracking-normal">AI route unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-velocity-muted">The orchestration page failed to load. Retry the route segment to reconnect the view.</p>
        <VelocityButton onClick={reset} className="mt-6">Retry</VelocityButton>
      </VelocityPanel>
    </main>
  );
}
