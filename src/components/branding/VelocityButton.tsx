import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type VelocityButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "ghost" | "outline";
};

export const VelocityButton = React.forwardRef<HTMLButtonElement, VelocityButtonProps>(
  ({ asChild = false, variant = "primary", className, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-velocity-sm px-5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-velocity-volt disabled:pointer-events-none disabled:opacity-50",
          variant === "primary" && "bg-velocity-volt text-velocity-black shadow-[0_0_24px_rgba(200,241,53,0.22)] hover:bg-[#d4ff3d]",
          variant === "ghost" && "border border-velocity-border bg-transparent text-velocity-muted hover:border-velocity-volt hover:text-velocity-volt",
          variant === "outline" && "border border-white/20 bg-transparent text-velocity-white hover:border-velocity-volt hover:text-velocity-volt",
          className
        )}
        {...props}
      />
    );
  }
);
VelocityButton.displayName = "VelocityButton";
