import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SERVICE_CATEGORY_ICONS, SERVICE_CATEGORY_LABELS } from "@/lib/utils";
import type { ServiceCategory } from "@/types";

const FEATURED_CATEGORIES: ServiceCategory[] = [
  "plumbing", "electrical", "hvac", "cleaning",
  "landscaping", "appliance_repair", "locksmith", "handyman",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-velocity-700">⚡ VeloCity</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link href="/auth/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/auth/signup">Get Started</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/provider/apply">Become a Provider</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-velocity-950 via-velocity-800 to-velocity-600 py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
            Local service,
            <br />
            <span className="text-velocity-300">delivered at velocity.</span>
          </h1>
          <p className="mt-6 text-xl text-velocity-200 max-w-2xl mx-auto">
            Book trusted local professionals for repairs, cleaning, maintenance,
            and emergencies. AI-matched, verified, and guaranteed.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="xl" asChild className="bg-white text-velocity-700 hover:bg-velocity-50">
              <Link href="/book">Book a Service</Link>
            </Button>
            <Button size="xl" variant="outline" asChild className="border-white text-white hover:bg-white/10">
              <Link href="/auth/signup">Create Account</Link>
            </Button>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-velocity-300">
            <span>✓ Verified providers</span>
            <span>✓ Price transparency</span>
            <span>✓ Satisfaction guarantee</span>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-3">
            What do you need help with?
          </h2>
          <p className="text-center text-gray-500 mb-12">
            From emergency repairs to routine maintenance — we&apos;ve got you covered.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {FEATURED_CATEGORIES.map((cat) => (
              <Link
                key={cat}
                href={`/book?category=${cat}`}
                className="flex flex-col items-center gap-3 rounded-xl border p-6 hover:border-velocity-400 hover:shadow-md transition-all group"
              >
                <span className="text-4xl">{SERVICE_CATEGORY_ICONS[cat]}</span>
                <span className="font-medium text-gray-700 group-hover:text-velocity-700">
                  {SERVICE_CATEGORY_LABELS[cat]}
                </span>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button variant="outline" asChild>
              <Link href="/book">View All Services</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How VeloCity works
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Describe your need", desc: "Tell us what's broken or what you need done. AI helps classify and prioritize." },
              { step: "02", title: "Get matched instantly", desc: "Our AI dispatch engine finds the best verified provider in your area." },
              { step: "03", title: "Approve & pay safely", desc: "Review the quote, authorize payment into escrow. No surprises." },
              { step: "04", title: "Rate & done", desc: "Job completed, payment released, review submitted. Guaranteed satisfaction." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-velocity-600 text-white font-bold text-lg mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agents Callout */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-velocity-950 p-10 text-white">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-bold mb-4">Powered by the VeloCity AI OS</h2>
              <p className="text-velocity-300 mb-6">
                10 specialized AI agents work 24/7 to ensure every job is perfectly matched, priced fairly, executed smoothly, and resolved if anything goes wrong.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                {[
                  { name: "ALICE", role: "Intake" },
                  { name: "MAX", role: "Dispatch" },
                  { name: "QUINN", role: "Pricing" },
                  { name: "NOVA", role: "Workflow" },
                  { name: "REX", role: "Quality" },
                  { name: "IVY", role: "Disputes" },
                  { name: "FINN", role: "Finance" },
                  { name: "LENA", role: "Retention" },
                  { name: "TESS", role: "Territory" },
                  { name: "GABRIEL", role: "Compliance" },
                ].map((agent) => (
                  <div key={agent.name} className="rounded-lg bg-white/10 p-3 text-center">
                    <div className="font-bold text-velocity-300">{agent.name}</div>
                    <div className="text-xs text-white/60">{agent.role}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="font-bold text-xl text-velocity-700">⚡ VeloCity Field Service</div>
            <div className="flex gap-6 text-sm text-gray-500">
              <Link href="/about" className="hover:text-gray-900">About</Link>
              <Link href="/provider/apply" className="hover:text-gray-900">For Providers</Link>
              <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-900">Terms</Link>
            </div>
            <div className="text-sm text-gray-400">© 2026 VeloCity. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
