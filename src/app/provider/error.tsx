"use client";
import { useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";

export default function ProviderError({
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
        <h1 className="text-2xl font-bold text-white mb-2">
          Something went wrong in the provider portal
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          An error occurred in the provider portal. Your job data is safe — please try again or
          return to your dashboard.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-6 py-2 bg-[#CCFF00] text-gray-950 font-semibold rounded-lg hover:bg-[#AACC00] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/provider/dashboard"
            className="px-6 py-2 border border-gray-700 text-gray-300 font-semibold rounded-lg hover:border-gray-500 hover:text-white transition-colors"
          >
            Provider dashboard
          </Link>
        </div>
      </div>
      {process.env.NODE_ENV === "development" && error.message && (
        <pre className="text-xs text-red-400 bg-gray-900 rounded p-4 max-w-lg overflow-auto">
          {error.message}
        </pre>
      )}
      {process.env.NODE_ENV === "development" && error.digest && (
        <p className="text-xs text-gray-600">Digest: {error.digest}</p>
      )}
    </div>
  );
}
