import { AppShell } from "@/components/layout";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell variant="customer">{children}</AppShell>;
}
