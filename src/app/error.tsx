"use client";
import { useEffect } from "react";
import { BrandLogo } from "@/components/brand";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VeloCity Error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 px-4">
      <BrandLogo size="lg" />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-gray-400 text-sm mb-6">
          An unexpected error occurred. Our team has been notified.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-[#CCFF00] text-gray-950 font-semibold rounded-lg hover:bg-[#AACC00] transition-colors"
        >
          Try again
        </button>
      </div>
      {process.env.NODE_ENV === "development" && error.message && (
        <pre className="text-xs text-red-400 bg-gray-900 rounded p-4 max-w-lg overflow-auto">
          {error.message}
        </pre>
      )}
    </div>
  );
}
