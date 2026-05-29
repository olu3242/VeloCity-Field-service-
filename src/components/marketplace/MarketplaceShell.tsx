import Link from "next/link";
import type { ReactNode } from "react";
import { BrandWordmark, VelocityButton } from "@/components/branding";
import { ThemeSwitcher } from "@/components/theme";
import { marketplaceNavGroups } from "@/config/marketplace";

export function MarketplaceShell({
  children,
}: {
  children?: ReactNode;
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-velocity-black text-velocity-white">
      <header className="sticky top-0 z-40 border-b border-velocity-border/80 bg-velocity-black/78 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="VeloCity home" className="shrink-0">
            <BrandWordmark />
          </Link>
          <nav aria-label="Marketplace navigation" className="hidden items-center gap-6 lg:flex">
            {marketplaceNavGroups.slice(0, 3).map((group) => (
              <div key={group.label} className="group relative">
                <button className="min-h-11 text-sm font-semibold text-velocity-muted transition hover:text-velocity-volt">
                  {group.label}
                </button>
                <div className="pointer-events-none absolute left-1/2 top-full w-64 -translate-x-1/2 translate-y-3 rounded-velocity-lg border border-velocity-border bg-velocity-carbon/95 p-2 opacity-0 shadow-velocity-panel backdrop-blur-xl transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  {group.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block rounded-velocity-sm px-3 py-3 text-sm text-velocity-muted transition hover:bg-velocity-graphite hover:text-velocity-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <ThemeSwitcher className="hidden xl:inline-flex" />
            <VelocityButton asChild variant="ghost">
              <Link href="/auth/login">Sign In</Link>
            </VelocityButton>
            <VelocityButton asChild>
              <Link href="/book">Book Service</Link>
            </VelocityButton>
          </div>
          <VelocityButton asChild className="sm:hidden">
            <Link href="/book">Book</Link>
          </VelocityButton>
        </div>
      </header>
      {children}
      <footer className="border-t border-velocity-border bg-velocity-black px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-velocity-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 VeloCity Field Service. Operational marketplace infrastructure.</span>
          <nav aria-label="Legal links" className="flex flex-wrap gap-x-4 gap-y-2">
            {[
              { label: "Terms", href: "/terms" },
              { label: "Privacy", href: "/privacy" },
              { label: "Provider Agreement", href: "/provider-agreement" },
              { label: "Contractor Agreement", href: "/contractor-agreement" },
              { label: "Refunds", href: "/refund-policy" },
              { label: "Cookies", href: "/cookie-policy" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-velocity-volt">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
      <nav
        aria-label="Mobile marketplace navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-velocity-border bg-velocity-black/92 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {[
            { label: "Services", href: "/services" },
            { label: "AI", href: "/ai/alice" },
            { label: "Providers", href: "/providers" },
            { label: "Book", href: "/book" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-11 rounded-velocity-sm px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-velocity-muted transition hover:bg-velocity-graphite hover:text-velocity-volt"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  );
}
