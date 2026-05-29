import { BrandLogo } from "@/components/brand";

export default function Loading() {
  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4 z-50">
      <div className="animate-pulse">
        <BrandLogo size="xl" />
      </div>
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-[#CCFF00] rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-[#CCFF00] rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-[#CCFF00] rounded-full animate-bounce" />
      </div>
    </div>
  );
}
