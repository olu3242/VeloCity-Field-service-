"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ICONS, cn } from "@/lib/utils";
import type { ServiceCategory } from "@/types";

const ALL_CATEGORIES = Object.keys(SERVICE_CATEGORY_LABELS).filter((c) => c !== "other") as ServiceCategory[];

export interface BusinessProfileFormValues {
  business_name: string;
  business_license: string | null;
  insurance_number: string | null;
  insurance_expiry: string | null;
  categories: ServiceCategory[];
  service_radius_miles: number;
  hourly_rate_cents: number | null;
  bio: string | null;
  years_experience: number;
}

export function BusinessProfileForm({ initial }: { initial: BusinessProfileFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function toggleCategory(cat: ServiceCategory) {
    setValues((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.categories.length) {
      setError("Select at least one service category.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/providers/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Could not save changes");
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}
      {savedAt && !error && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          Business profile updated.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Business Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business_name">Business / Professional Name</Label>
            <Input
              id="business_name"
              value={values.business_name}
              onChange={(e) => setValues((v) => ({ ...v, business_name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Professional Bio</Label>
            <Textarea
              id="bio"
              rows={4}
              value={values.bio ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value || null }))}
              placeholder="Tell customers about your expertise and experience..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="years_experience">Years of Experience</Label>
            <Input
              id="years_experience"
              type="number"
              min={0}
              max={80}
              value={values.years_experience}
              onChange={(e) => setValues((v) => ({ ...v, years_experience: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Services &amp; Coverage Area</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Service Categories</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-all text-left",
                    values.categories.includes(cat)
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
              <Label htmlFor="service_radius_miles">Service Radius (miles)</Label>
              <Input
                id="service_radius_miles"
                type="number"
                min={1}
                max={250}
                value={values.service_radius_miles}
                onChange={(e) => setValues((v) => ({ ...v, service_radius_miles: parseInt(e.target.value, 10) || 1 }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourly_rate_cents">Hourly Rate (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  id="hourly_rate_cents"
                  type="number"
                  min={0}
                  className="pl-7"
                  value={values.hourly_rate_cents ? values.hourly_rate_cents / 100 : ""}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      hourly_rate_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Licenses &amp; Insurance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business_license">Business License Number</Label>
            <Input
              id="business_license"
              value={values.business_license ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, business_license: e.target.value || null }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="insurance_number">Insurance Policy Number</Label>
              <Input
                id="insurance_number"
                value={values.insurance_number ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, insurance_number: e.target.value || null }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insurance_expiry">Insurance Expiry</Label>
              <Input
                id="insurance_expiry"
                type="date"
                value={values.insurance_expiry ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, insurance_expiry: e.target.value || null }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
