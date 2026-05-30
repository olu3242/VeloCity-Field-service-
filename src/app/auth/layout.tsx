import { AppShell } from "@/components/layout";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AppShell variant="auth">{children}</AppShell>;
}
