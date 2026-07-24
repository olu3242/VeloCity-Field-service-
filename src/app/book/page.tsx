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

interface ServicePackage {
  id: string;
  tier: string;
  name: string;
  description: string | null;
  price_cents: number | null;
}

interface ServiceType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  default_duration_minutes: number | null;
  service_packages: ServicePackage[];
}

type Step = "category" | "serviceType" | "details" | "address";

function BookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultCategory = searchParams.get("category") as ServiceCategory | null;
  const defaultQuery = searchParams.get("q") ?? "";

  const [step, setStep] = useState<Step>("category");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<ServiceCategory | null>(defaultCategory);
  const [title, setTitle] = useState(defaultQuery);
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<UrgencyLevel>("scheduled");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [preferredDate, setPreferredDate] = useState("");

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [servicePackageId, setServicePackageId] = useState<string | null>(null);

  const STEP_ORDER: Step[] = serviceTypes.length > 0
    ? ["category", "serviceType", "details", "address"]
    : ["category", "details", "address"];

  async function goToServiceTypeOrDetails() {
    if (!category) return;
    setLoadingServiceTypes(true);
    setServiceTypeId(null);
    setServicePackageId(null);
    try {
      const res = await fetch(`/api/service-types?category=${category}`);
      const { data } = await res.json();
      const types: ServiceType[] = data ?? [];
      setServiceTypes(types);
      setStep(types.length > 0 ? "serviceType" : "details");
    } catch {
      setServiceTypes([]);
      setStep("details");
    } finally {
      setLoadingServiceTypes(false);
    }
  }

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
          service_type_id: serviceTypeId ?? undefined,
          service_package_id: servicePackageId ?? undefined,
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
          {STEP_ORDER.map((s) => (
            <div
              key={s}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors",
                STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(s) ? "bg-velocity-600" : "bg-gray-200"
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

          {/* Step: Category */}
          {step === "category" && (
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
                disabled={!category || loadingServiceTypes}
                onClick={goToServiceTypeOrDetails}
              >
                {loadingServiceTypes ? "Loading..." : "Continue"}
              </Button>
            </div>
          )}

          {/* Step: Service type & package (only when configured for this category) */}
          {step === "serviceType" && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold">Narrow down the service (optional)</h2>
              <p className="text-sm text-gray-500">Pick a specific service type and package, or skip to continue with a general request.</p>

              <div className="space-y-3">
                {serviceTypes.map((st) => (
                  <div key={st.id}>
                    <button
                      onClick={() => {
                        setServiceTypeId(st.id);
                        setServicePackageId(null);
                      }}
                      className={cn(
                        "w-full rounded-lg border p-4 text-left transition-all hover:border-velocity-400",
                        serviceTypeId === st.id
                          ? "border-velocity-600 bg-velocity-50 text-velocity-700"
                          : "border-gray-200"
                      )}
                    >
                      <div className="font-medium">{st.name}</div>
                      {st.description && <div className="text-xs text-gray-500 mt-1">{st.description}</div>}
                    </button>

                    {serviceTypeId === st.id && st.service_packages.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pl-2">
                        {st.service_packages.map((pkg) => (
                          <button
                            key={pkg.id}
                            onClick={() => setServicePackageId(pkg.id)}
                            className={cn(
                              "rounded-lg border p-3 text-left text-sm transition-all",
                              servicePackageId === pkg.id
                                ? "border-velocity-600 bg-velocity-50 text-velocity-700"
                                : "border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <div className="font-medium">{pkg.name}</div>
                            {pkg.price_cents != null && (
                              <div className="text-xs text-gray-500 mt-0.5">${(pkg.price_cents / 100).toFixed(2)}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep("category")} className="flex-1">Back</Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep("details")}
                >
                  {serviceTypeId ? "Continue" : "Skip"}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Details */}
          {step === "details" && (
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
                <Button
                  variant="outline"
                  onClick={() => setStep(serviceTypes.length > 0 ? "serviceType" : "category")}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!title || !description}
                  onClick={() => setStep("address")}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step: Address & Schedule */}
          {step === "address" && (
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
                <Button variant="outline" onClick={() => setStep("details")} className="flex-1">Back</Button>
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
