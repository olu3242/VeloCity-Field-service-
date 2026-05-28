"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, CalendarClock, CheckCircle2, MapPin, UploadCloud, WandSparkles } from "lucide-react";
import { MarketplaceShell, MarketplaceIcon } from "@/components/marketplace";
import { VelocityBadge, VelocityButton, VelocityPanel } from "@/components/branding";
import { marketplaceServices, getServiceByCategory } from "@/config/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { URGENCY_LABELS, cn, formatCents } from "@/lib/utils";
import type { ServiceCategory, UrgencyLevel } from "@/types";

const CATEGORIES = marketplaceServices.map((service) => service.category);
const URGENCIES = Object.keys(URGENCY_LABELS) as UrgencyLevel[];

function BookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultCategory = searchParams?.get("category") as ServiceCategory | null;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<ServiceCategory | null>(
    CATEGORIES.includes(defaultCategory as ServiceCategory) ? defaultCategory : null
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<UrgencyLevel>("scheduled");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [photoCount, setPhotoCount] = useState(0);

  const selectedService = category ? getServiceByCategory(category) : null;
  const estimate = useMemo(() => {
    const base = selectedService?.startingAtCents ?? 7500;
    const multiplier = urgency === "emergency" ? 1.5 : urgency === "same_day" ? 1.15 : 1;
    return Math.round(base * multiplier);
  }, [selectedService, urgency]);

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

      const responseBody = await res.json();

      if (!res.ok) {
        throw new Error(responseBody.error ?? "Failed to submit request");
      }

      const job = responseBody.data;
      router.push(`/dashboard/jobs/${job.id}?booked=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  const canContinueDetails = title.trim().length > 2 && description.trim().length > 9;
  const canSubmit = Boolean(street && city && state && zip && category && !loading);

  return (
    <MarketplaceShell>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-32 pt-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <VelocityBadge>{"// AI REQUEST FLOW"}</VelocityBadge>
          <h1 className="mt-5 font-display text-6xl uppercase tracking-normal text-velocity-white sm:text-7xl">
            Book service through AI dispatch.
          </h1>
          <p className="mt-5 text-lg leading-8 text-velocity-muted">
            Select a service, describe the issue, validate location, and create a real job that triggers ALICE intake and automation events.
          </p>

          <VelocityPanel className="mt-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-velocity-sm border border-velocity-border bg-velocity-black text-velocity-volt">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-velocity-volt">Runtime path</h2>
                <ol className="mt-4 space-y-3 text-sm text-velocity-muted">
                  {["ALICE classifies request", "Service area validates ZIP", "Job persists in Supabase", "Automation queue emits dispatch event"].map((item) => (
                    <li key={item} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-velocity-volt" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </VelocityPanel>
        </div>

        <div>
          <div className="mb-5 grid grid-cols-4 gap-2" aria-label="Booking progress">
            {["Service", "Issue", "Schedule", "Dispatch"].map((label, index) => (
              <div key={label} className="min-w-0">
                <div
                  className={cn(
                    "h-2 rounded-full transition",
                    step >= index + 1 ? "bg-velocity-volt shadow-velocity-glow" : "bg-velocity-border"
                  )}
                />
                <div className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-velocity-muted">{label}</div>
              </div>
            ))}
          </div>

          <VelocityPanel className="p-5 sm:p-7">
            {error ? (
              <div className="mb-6 rounded-velocity-sm border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
                {error} {error.toLowerCase().includes("unauthorized") ? <Link href="/auth/login" className="underline">Sign in to continue.</Link> : null}
              </div>
            ) : null}

            {step === 1 ? (
              <div>
                <h2 className="font-display text-4xl uppercase tracking-normal text-velocity-white">Select service</h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {marketplaceServices.map((service) => (
                    <button
                      key={service.category}
                      onClick={() => setCategory(service.category)}
                      className={cn(
                        "min-h-28 rounded-velocity-sm border p-4 text-left transition hover:border-velocity-volt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-velocity-volt",
                        category === service.category
                          ? "border-velocity-volt bg-velocity-volt/10"
                          : "border-velocity-border bg-velocity-black/45"
                      )}
                    >
                      <MarketplaceIcon name={service.icon} className="h-5 w-5 text-velocity-volt" />
                      <div className="mt-3 font-semibold text-velocity-white">{service.label}</div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-velocity-muted">
                        {formatCents(service.startingAtCents)} · {service.eta}
                      </div>
                    </button>
                  ))}
                </div>
                <VelocityButton className="mt-6 w-full sm:w-auto" disabled={!category} onClick={() => setStep(2)}>
                  Continue
                </VelocityButton>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <h2 className="font-display text-4xl uppercase tracking-normal text-velocity-white">Describe the issue</h2>
                <div className="space-y-2">
                  <Label htmlFor="title">Job title</Label>
                  <Input id="title" placeholder="Leaking kitchen faucet" value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Details for ALICE</Label>
                  <Textarea
                    id="description"
                    placeholder="Tell us what happened, what you see, and any safety concerns."
                    rows={5}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="rounded-velocity-sm border border-dashed border-velocity-border bg-velocity-black/40 p-4">
                  <Label htmlFor="photos" className="flex min-h-11 cursor-pointer items-center gap-3 text-velocity-muted">
                    <UploadCloud className="h-5 w-5 text-velocity-volt" />
                    <span>{photoCount ? `${photoCount} image selected for intake context` : "Optional: add photos for faster triage"}</span>
                  </Label>
                  <input
                    id="photos"
                    type="file"
                    multiple
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => setPhotoCount(event.target.files?.length ?? 0)}
                  />
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <Button variant="outline" onClick={() => setStep(1)} className="min-h-11 flex-1">Back</Button>
                  <Button disabled={!canContinueDetails} onClick={() => setStep(3)} className="min-h-11 flex-1">Continue</Button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-5">
                <h2 className="font-display text-4xl uppercase tracking-normal text-velocity-white">Location and timing</h2>
                <div className="space-y-2">
                  <Label htmlFor="street">Street address</Label>
                  <Input id="street" placeholder="123 Main St" value={street} onChange={(event) => setStreet(event.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" placeholder="Austin" value={city} onChange={(event) => setCity(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" placeholder="TX" maxLength={2} value={state} onChange={(event) => setState(event.target.value.toUpperCase())} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="zip">ZIP code</Label>
                    <Input id="zip" placeholder="78701" maxLength={5} value={zip} onChange={(event) => setZip(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Preferred date</Label>
                    <Input id="date" type="date" min={new Date().toISOString().split("T")[0]} value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Urgency</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {URGENCIES.map((item) => (
                      <button
                        key={item}
                        onClick={() => setUrgency(item)}
                        className={cn(
                          "min-h-16 rounded-velocity-sm border p-3 text-left text-sm transition hover:border-velocity-volt",
                          urgency === item ? "border-velocity-volt bg-velocity-volt/10 text-velocity-white" : "border-velocity-border text-velocity-muted"
                        )}
                      >
                        {URGENCY_LABELS[item]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <Button variant="outline" onClick={() => setStep(2)} className="min-h-11 flex-1">Back</Button>
                  <Button disabled={!street || !city || !state || !zip} onClick={() => setStep(4)} className="min-h-11 flex-1">Review Dispatch</Button>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-6">
                <h2 className="font-display text-4xl uppercase tracking-normal text-velocity-white">Dispatch review</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
                    <WandSparkles className="h-5 w-5 text-velocity-volt" />
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-velocity-muted">AI Intake</p>
                    <p className="mt-1 text-sm text-velocity-white">{selectedService?.label ?? "Service"} classified</p>
                  </div>
                  <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
                    <MapPin className="h-5 w-5 text-velocity-volt" />
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-velocity-muted">Coverage</p>
                    <p className="mt-1 text-sm text-velocity-white">{zip || "ZIP"} will be validated</p>
                  </div>
                  <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
                    <CalendarClock className="h-5 w-5 text-velocity-volt" />
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-velocity-muted">Preview</p>
                    <p className="mt-1 text-sm text-velocity-white">{formatCents(estimate)} starting estimate</p>
                  </div>
                </div>
                <div className="rounded-velocity-sm border border-velocity-border bg-velocity-carbon/70 p-5">
                  <h3 className="font-semibold text-velocity-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-velocity-muted">{description}</p>
                  <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-velocity-muted">
                    {street}, {city}, {state} {zip} · {URGENCY_LABELS[urgency]}
                  </p>
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <Button variant="outline" onClick={() => setStep(3)} className="min-h-11 flex-1">Back</Button>
                  <Button disabled={!canSubmit} onClick={handleSubmit} className="min-h-11 flex-1">
                    {loading ? "Creating request..." : "Create Service Request"}
                  </Button>
                </div>
              </div>
            ) : null}
          </VelocityPanel>
        </div>
      </section>
    </MarketplaceShell>
  );
}

export default function BookPage() {
  return (
    <Suspense>
      <BookingForm />
    </Suspense>
  );
}
