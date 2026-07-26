import { cn } from "@/lib/utils";

type AppVariant = "customer" | "provider" | "admin" | "auth" | "dispatch" | "franchise";

export function AppShell({
  children,
  variant = "customer",
}: {
  children: React.ReactNode;
  variant?: AppVariant;
}) {
  // All variants share the VeloCity dark background.
  // The variant prop is kept for future per-section accent customization.
  void variant;
  return (
    <div className={cn("min-h-screen bg-background text-foreground")}>
      {children}
    </div>
  );
}
