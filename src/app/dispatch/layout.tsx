import { AppShell } from "@/components/layout";

export default function DispatchLayout({ children }: { children: React.ReactNode }) {
  return <AppShell variant="dispatch">{children}</AppShell>;
}
