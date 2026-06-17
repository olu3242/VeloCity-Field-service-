"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_ICONS,
  URGENCY_LABELS,
  cn,
} from "@/lib/utils";
import type { ServiceCategory, UrgencyLevel } from "@/types";

const CATEGORIES = Object.keys(SERVICE_CATEGORY_LABELS) as ServiceCategory[];
const URGENCIES = Object.keys(URGENCY_LABELS) as UrgencyLevel[];

function BookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultCategory = searchParams.get("category") as ServiceCategory | null;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<ServiceCategory | null>(defaultCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<UrgencyLevel>("scheduled");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [preferredDate, setPreferredDate] = useState("");

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title,
          description,
          urgency,
          street,
          city,
          state,
          zip,
          preferred_date: preferredDate || undefined,
          photo_urls: [],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to submit request");
      }

      const { data: job } = await res.json();
      router.push(`/dashboard/jobs/${job.id}?booked=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Book a Service</h1>
          <p className="text-gray-500 mt-2">Tell us what you need — we&apos;ll find the right pro.</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors",
                step >= s ? "bg-velocity-600" : "bg-gray-200"
              )}
            />
          ))}
        </div>

        <div className="bg-white rounded-xl border p-8 shadow-sm">
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Category */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold mb-6">What type of service do you need?</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-all hover:border-velocity-400",
                      category === cat
                        ? "border-velocity-600 bg-velocity-50 text-velocity-700"
                        : "border-gray-200"
                    )}
                  >
                    <span className="text-2xl">{SERVICE_CATEGORY_ICONS[cat]}</span>
                    <span className="font-medium">{SERVICE_CATEGORY_LABELS[cat]}</span>
                  </button>
                ))}
              </div>
              <Button
                className="w-full mt-6"
                disabled={!category}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold">Describe the job</h2>

              <div className="space-y-2">
                <Label htmlFor="title">Job title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Leaking kitchen faucet"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the issue in detail. The more you share, the better we can match you..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Urgency</Label>
                <div className="grid grid-cols-3 gap-3">
                  {URGENCIES.map((u) => (
                    <button
                      key={u}
                      onClick={() => setUrgency(u)}
                      className={cn(
                        "rounded-lg border p-3 text-sm text-left transition-all",
                        urgency === u
                          ? "border-velocity-600 bg-velocity-50 text-velocity-700"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="font-medium">{URGENCY_LABELS[u].split(" (")[0]}</div>
                      {u === "emergency" && <div className="text-xs text-orange-600 mt-0.5">+50% fee</div>}
                      {u === "same_day" && <div className="text-xs text-yellow-600 mt-0.5">+15% fee</div>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button
                  className="flex-1"
                  disabled={!title || !description}
                  onClick={() => setStep(3)}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Address & Schedule */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold">Where & when?</h2>

              <div className="space-y-2">
                <Label htmlFor="street">Street address</Label>
                <Input
                  id="street"
                  placeholder="123 Main St"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" placeholder="Austin" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" placeholder="TX" maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip">ZIP code</Label>
                <Input id="zip" placeholder="78701" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value)} />
              </div>

              {urgency === "scheduled" && (
                <div className="space-y-2">
                  <Label htmlFor="date">Preferred date</Label>
                  <Input
                    id="date"
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
                <Button
                  className="flex-1"
                  disabled={!street || !city || !state || !zip || loading}
                  onClick={handleSubmit}
                >
                  {loading ? "Submitting..." : "Request Service"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense>
      <BookingForm />
    </Suspense>
  );
}
