"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/lib/utils";
import type { QuoteLineItem } from "@/types";

const EMPTY_LINE: QuoteLineItem = {
  description: "",
  quantity: 1,
  unit_price_cents: 0,
  total_cents: 0,
  type: "labor",
};

export default function SubmitQuotePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.id as string;

  const [lines, setLines] = useState<QuoteLineItem[]>([{ ...EMPTY_LINE }]);
  const [notes, setNotes] = useState("");
  const [isChangeOrder, setIsChangeOrder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(i: number, field: keyof QuoteLineItem, raw: string) {
    setLines((prev) => {
      const next = [...prev];
      const line = { ...next[i] } as Record<string, unknown>;
      if (field === "quantity" || field === "unit_price_cents") {
        const num = field === "unit_price_cents" ? Math.round(parseFloat(raw) * 100) : parseInt(raw);
        line[field] = isNaN(num) ? 0 : num;
      } else {
        line[field] = raw;
      }
      line.total_cents = (line.quantity as number) * (line.unit_price_cents as number);
      next[i] = line as unknown as QuoteLineItem;
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const subtotal = lines.reduce((sum, l) => sum + l.total_cents, 0);
  const tax = Math.round(subtotal * 0.0825);
  const total = subtotal + tax;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.some((l) => !l.description || l.total_cents <= 0)) {
      setError("All line items need a description and a price.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, line_items: lines, notes, is_change_order: isChangeOrder }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to submit quote");
      setLoading(false);
      return;
    }
    router.push(`/provider/jobs/${jobId}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href={`/provider/jobs/${jobId}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to Job
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium">Submit Quote</span>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Submit Quote</h1>

        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-8 shadow-sm space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="change_order"
              checked={isChangeOrder}
              onChange={(e) => setIsChangeOrder(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="change_order">This is a change order (additional work)</Label>
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <Label>Line Items</Label>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {i === 0 && <div className="text-xs text-gray-500 mb-1">Description</div>}
                  <Input
                    placeholder="e.g. Labor — pipe replacement"
                    value={line.description}
                    onChange={(e) => updateLine(i, "description", e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <div className="text-xs text-gray-500 mb-1">Type</div>}
                  <select
                    value={line.type}
                    onChange={(e) => updateLine(i, "type", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm"
                  >
                    <option value="labor">Labor</option>
                    <option value="parts">Parts</option>
                    <option value="travel">Travel</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <div className="text-xs text-gray-500 mb-1">Qty</div>}
                  <Input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, "quantity", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <div className="text-xs text-gray-500 mb-1">Unit $</div>}
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(line.unit_price_cents / 100).toFixed(2)}
                    onChange={(e) => updateLine(i, "unit_price_cents", e.target.value)}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              + Add Line Item
            </Button>
          </div>

          {/* Totals */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>{formatCents(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax (8.25%)</span><span>{formatCents(tax)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t">
              <span>Total</span><span>{formatCents(total)}</span>
            </div>
            <div className="flex justify-between text-green-700 font-medium pt-1">
              <span>Your payout (82%)</span><span>{formatCents(Math.round(total * 0.82))}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Explain scope, parts sourced, timing..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || total <= 0}>
            {loading ? "Submitting..." : "Submit Quote"}
          </Button>
        </form>
      </div>
    </div>
  );
}
