"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function CheckoutForm({
  amountCents,
  onSuccess,
}: {
  amountCents: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Payment failed");
      setLoading(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard/jobs/${window.location.pathname.split("/")[3]}?paid=1`,
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={!stripe || loading}>
        {loading ? "Processing..." : `Pay ${formatCents(amountCents)}`}
      </Button>
    </form>
  );
}

export default function PayPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      // Fetch job to get quoted amount
      const jobRes = await fetch(`/api/jobs/${jobId}`);
      if (!jobRes.ok) { setError("Job not found"); setLoading(false); return; }
      const { data: job } = await jobRes.json();

      const amount = job.final_cost_cents ?? job.quoted_cost_cents;
      if (!amount) { setError("No amount to pay"); setLoading(false); return; }

      const hasDeposit = job.payments?.some(
        (p: Record<string, unknown>) => p.type === "deposit" && p.status === "escrowed"
      );
      const type = hasDeposit ? "final" : "deposit";
      const payAmount = hasDeposit ? amount : job.deposit_amount_cents ?? Math.round(amount * 0.3);

      setAmountCents(payAmount);

      const res = await fetch("/api/payments/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, amount_cents: payAmount, type }),
      });
      if (!res.ok) { setError("Could not initialize payment"); setLoading(false); return; }
      const { client_secret } = await res.json();
      setClientSecret(client_secret);
      setLoading(false);
    }
    init();
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading payment...</p>
      </div>
    );
  }

  if (error || !clientSecret) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error ?? "Something went wrong"}</p>
          <Link href={`/dashboard/jobs/${jobId}`} className="text-velocity-600 hover:underline">
            Back to job
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href={`/dashboard/jobs/${jobId}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to Job
        </Link>
      </nav>

      <div className="mx-auto max-w-md px-4 py-12">
        <div className="bg-white border rounded-xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">Secure Payment</h1>
            <p className="text-gray-500 mt-1">
              {formatCents(amountCents)} held in escrow until job is confirmed
            </p>
          </div>

          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: "stripe" } }}
          >
            <CheckoutForm
              amountCents={amountCents}
              onSuccess={() => router.push(`/dashboard/jobs/${jobId}?paid=1`)}
            />
          </Elements>

          <p className="text-xs text-center text-gray-400 mt-4">
            Secured by Stripe. Funds held in escrow until you confirm the job is complete.
          </p>
        </div>
      </div>
    </div>
  );
}
