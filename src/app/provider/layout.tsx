import { AppShell } from "@/components/layout";

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return <AppShell variant="provider">{children}</AppShell>;
}
