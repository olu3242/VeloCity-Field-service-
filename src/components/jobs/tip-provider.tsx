"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Heart, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const PRESETS = [
  { label: "$5",  cents: 500  },
  { label: "$10", cents: 1000 },
  { label: "$20", cents: 2000 },
  { label: "$50", cents: 5000 },
];

interface ExistingTip {
  id: string;
  amount_cents: number;
  payment_status: "pending" | "succeeded" | "failed";
  note: string | null;
  created_at: string;
}

interface TipProviderProps {
  jobId: string;
  providerName?: string;
}

export function TipProvider({ jobId, providerName }: TipProviderProps) {
  const [selectedCents, setSelectedCents] = useState<number | null>(null);
  const [customValue, setCustomValue]     = useState("");
  const [note, setNote]                   = useState("");
  const [loading, setLoading]             = useState(false);
  const [checking, setChecking]           = useState(true);
  const [existingTip, setExistingTip]     = useState<ExistingTip | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState(false);

  // Check for existing tip on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tips?job_id=${jobId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) setExistingTip(json.data);
        }
      } finally {
        setChecking(false);
      }
    })();
  }, [jobId]);

  const effectiveCents = selectedCents
    ?? (customValue ? Math.round(parseFloat(customValue) * 100) : null);

  async function handleSubmit() {
    if (!effectiveCents || effectiveCents < 100) {
      setError("Please select or enter a tip amount (minimum $1.00)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id:       jobId,
          amount_cents: effectiveCents,
          note:         note.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Stripe requires client-side confirmation
      if (json.data?.requires_action && json.data?.client_secret) {
        const { getStripe } = await import("@/lib/stripe/client");
        const stripe = await getStripe();
        if (!stripe) {
          setError("Stripe failed to load. Please refresh and try again.");
          return;
        }
        const { error: stripeError } = await stripe.confirmPayment({
          clientSecret: json.data.client_secret,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });

        if (stripeError) {
          setError(stripeError.message ?? "Payment failed");
          return;
        }

        // Confirm server-side after Stripe success
        const confirmRes = await fetch("/api/tips", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_intent_id: json.data.payment_intent_id,
            job_id:            jobId,
            amount_cents:      effectiveCents,
            note:              note.trim() || null,
          }),
        });
        if (!confirmRes.ok) {
          const cj = await confirmRes.json();
          setError(cj.error ?? "Failed to confirm tip");
          return;
        }
      }

      setSuccess(true);
      setExistingTip({
        id:             json.data?.id ?? "new",
        amount_cents:   effectiveCents,
        payment_status: "succeeded",
        note:           note.trim() || null,
        created_at:     new Date().toISOString(),
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry() {
    setExistingTip(null);
    setError(null);
  }

  // ── Loading state ────────────────────────────────────────
  if (checking) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ── Already tipped successfully ──────────────────────────
  if (existingTip?.payment_status === "succeeded") {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">
                Tip sent! ${(existingTip.amount_cents / 100).toFixed(2)}
                {providerName ? ` to ${providerName}` : ""}
              </p>
              {existingTip.note && (
                <p className="text-sm text-green-700 mt-1 italic">"{existingTip.note}"</p>
              )}
              <p className="text-xs text-green-600 mt-1">
                {new Date(existingTip.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Failed tip — retry ───────────────────────────────────
  if (existingTip?.payment_status === "failed") {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-700">Tip payment failed</p>
              <p className="text-sm text-muted-foreground">
                Your previous ${(existingTip.amount_cents / 100).toFixed(2)} tip could not be processed.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Tip form ─────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Heart className="h-4 w-4 text-rose-500" />
          Tip your provider{providerName ? ` — ${providerName}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset amounts */}
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.cents}
              variant={selectedCents === p.cents ? "default" : "outline"}
              size="sm"
              onClick={() => { setSelectedCents(p.cents); setCustomValue(""); setError(null); }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* Custom amount */}
        <div>
          <Label htmlFor="custom-tip" className="text-xs text-muted-foreground">
            Custom amount
          </Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="custom-tip"
              type="number"
              min="1"
              max="10000"
              step="0.01"
              placeholder="0.00"
              className="pl-7"
              value={customValue}
              onChange={(e) => {
                setCustomValue(e.target.value);
                setSelectedCents(null);
                setError(null);
              }}
            />
          </div>
        </div>

        {/* Optional note */}
        <div>
          <Label htmlFor="tip-note" className="text-xs text-muted-foreground">
            Say thanks (optional)
          </Label>
          <Textarea
            id="tip-note"
            placeholder="Great work! Super clean and professional."
            className="mt-1 resize-none"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{note.length}/500</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={loading || !effectiveCents || effectiveCents < 100}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</>
            : effectiveCents && effectiveCents >= 100
              ? `Send ${`$${(effectiveCents / 100).toFixed(2)}`} Tip`
              : "Send Tip"}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          100% goes directly to your provider. No platform fee.
        </p>
      </CardContent>
    </Card>
  );
}
