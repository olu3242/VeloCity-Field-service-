import { cn } from "@/lib/utils";

type AppVariant = "customer" | "provider" | "admin" | "auth";

const variantClasses: Record<AppVariant, string> = {
  customer: "bg-gray-50",
  auth: "bg-gray-50",
  provider: "bg-gray-950",
  admin: "bg-gray-950",
};

export function AppShell({
  children,
  variant = "customer",
}: {
  children: React.ReactNode;
  variant?: AppVariant;
}) {
  return (
    <div className={cn("min-h-screen", variantClasses[variant])}>
      {children}
    </div>
  );
}
