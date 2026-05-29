import { AppShell } from "@/components/layout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell variant="admin">{children}</AppShell>;
}
