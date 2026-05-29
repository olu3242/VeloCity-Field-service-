import Link from "next/link";
import { BrandLogo } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 px-4">
      <BrandLogo size="lg" />
      <div className="text-center">
        <p className="text-[#CCFF00] text-sm font-medium uppercase tracking-wider mb-2">404</p>
        <h1 className="text-3xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-gray-400 text-sm mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="px-6 py-2 bg-[#CCFF00] text-gray-950 font-semibold rounded-lg hover:bg-[#AACC00] transition-colors inline-block"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
