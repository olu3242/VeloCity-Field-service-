"use client";

import { VelocityButton, VelocityPanel } from "@/components/branding";

export default function ServicesError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-velocity-black p-6 text-velocity-white">
      <VelocityPanel className="max-w-md text-center">
        <h1 className="font-display text-4xl uppercase tracking-normal">Service grid unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-velocity-muted">The marketplace route failed to load. Retry the request to recover the route segment.</p>
        <VelocityButton onClick={reset} className="mt-6">Retry</VelocityButton>
      </VelocityPanel>
    </main>
  );
}
