"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FranchiseApplyPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [experience, setExperience] = useState("");
  const [capital, setCapital] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string; territory?: { name: string } } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/franchise/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          territory_id: territoryId,
          qualifications: { years_experience: experience, startup_capital: capital },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Application failed. Please try again." });
      } else {
        setResult({ success: true, territory: data.territory });
      }
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link href="/" className="font-bold text-2xl text-[#CCFF00]">⚡ VeloCity</Link>
          <h1 className="mt-4 text-xl font-bold">Franchise Operator Application</h1>
          <p className="mt-2 text-white/40 text-sm">
            Apply to operate a franchise territory. An administrator will review your application.
          </p>
        </div>

        {result?.success ? (
          <Card className="bg-gray-900 border-green-500/30 text-white">
            <CardHeader>
              <CardTitle className="text-green-400">Application Submitted</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/70">
              <p>Your application for territory <strong className="text-white">{result.territory?.name}</strong> has been received.</p>
              <p>You will be contacted once your application is reviewed. The administrator can approve or decline via the Franchise Management dashboard.</p>
              <div className="pt-2">
                <Link href="/dashboard" className="text-[#CCFF00] hover:underline text-sm">
                  Return to dashboard →
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Your Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">Full name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-gray-800 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#CCFF00]/50"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-gray-800 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#CCFF00]/50"
                    placeholder="contact@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">Territory ID *</label>
                  <input
                    type="text"
                    required
                    value={territoryId}
                    onChange={(e) => setTerritoryId(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-gray-800 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#CCFF00]/50 font-mono"
                    placeholder="Paste the territory UUID from your administrator"
                  />
                  <div className="mt-1 text-xs text-white/30">Your VeloCity franchise contact will provide this UUID.</div>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">Years of field service experience</label>
                  <input
                    type="number"
                    min="0"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-gray-800 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#CCFF00]/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">Available startup capital (USD)</label>
                  <input
                    type="text"
                    value={capital}
                    onChange={(e) => setCapital(e.target.value)}
                    className="w-full rounded-md border border-white/20 bg-gray-800 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#CCFF00]/50"
                    placeholder="e.g. 50000"
                  />
                </div>

                {result?.error && (
                  <div className="rounded-md bg-red-500/20 border border-red-500/30 px-3 py-2 text-sm text-red-400">
                    {result.error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#CCFF00] text-black hover:bg-[#b8e600] font-semibold"
                >
                  {submitting ? "Submitting…" : "Submit Application"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
