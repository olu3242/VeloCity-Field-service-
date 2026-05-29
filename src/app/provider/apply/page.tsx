"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ICONS, cn } from "@/lib/utils";
import type { ServiceCategory } from "@/types";

const ALL_CATEGORIES = Object.keys(SERVICE_CATEGORY_LABELS) as ServiceCategory[];

export default function ProviderApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [yearsExp, setYearsExp] = useState(0);
  const [serviceRadius, setServiceRadius] = useState(25);
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");

  function toggleCategory(cat: ServiceCategory) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categories.length) {
      setError("Please select at least one service category.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          categories,
          years_experience: yearsExp,
          service_radius_miles: serviceRadius,
          bio: bio || undefined,
          hourly_rate_cents: hourlyRate ? parseInt(hourlyRate) * 100 : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Application failed");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h1>
          <p className="text-gray-500 mb-6">
            Our team (with help from GABRIEL) will review your application within 2-3 business days.
            You&apos;ll receive an email with next steps.
          </p>
          <Button asChild>
            <Link href="/provider/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4">
        <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Become a Provider</h1>
          <p className="text-gray-500 mt-2">
            Join our network of verified professionals. Earn on your schedule.
          </p>
        </div>

        <div className="bg-white rounded-xl border p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="business">Business / Professional Name</Label>
              <Input
                id="business"
                placeholder="Smith Plumbing Services"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Service Categories <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {ALL_CATEGORIES.filter((c) => c !== "other").map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-all text-left",
                      categories.includes(cat)
                        ? "border-velocity-600 bg-velocity-50 text-velocity-700"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <span>{SERVICE_CATEGORY_ICONS[cat]}</span>
                    <span className="text-xs font-medium">{SERVICE_CATEGORY_LABELS[cat]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exp">Years of Experience</Label>
                <Input
                  id="exp"
                  type="number"
                  min="0"
                  max="50"
                  value={yearsExp}
                  onChange={(e) => setYearsExp(parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="radius">Service Radius (miles)</Label>
                <Input
                  id="radius"
                  type="number"
                  min="5"
                  max="100"
                  value={serviceRadius}
                  onChange={(e) => setServiceRadius(parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate">Hourly Rate (USD, optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  id="rate"
                  type="number"
                  min="20"
                  placeholder="85"
                  className="pl-7"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Professional Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell customers about your expertise, certifications, and why they should choose you..."
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
              <strong>Next steps after applying:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Upload license & insurance documents</li>
                <li>Complete background check</li>
                <li>Admin review (1-2 business days)</li>
                <li>Connect Stripe for payouts</li>
              </ol>
              <p className="mt-3">
                By submitting, you agree to the{" "}
                <Link href="/provider-agreement" className="underline">Provider Agreement</Link>
                {" "}and{" "}
                <Link href="/contractor-agreement" className="underline">Independent Contractor Agreement</Link>.
              </p>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Submitting application..." : "Submit Application"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
