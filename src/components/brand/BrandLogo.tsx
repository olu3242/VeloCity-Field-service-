"use client";
import { cn } from "@/lib/utils";

const sizes = { sm: 24, md: 32, lg: 48, xl: 64 };

export function BrandLogo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const px = sizes[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("flex-shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" fill="#0A0A0A" />
      <path d="M18 4L8 18H15L14 28L24 14H17L18 4Z" fill="#CCFF00" />
    </svg>
  );
}
