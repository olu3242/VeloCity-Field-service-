import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDateTime } from "@/lib/utils";

type Filter = { column: string; value: string | number | boolean | null };

export interface RelatedListProps {
  title: string;
  table: string;
  tenantId: string;
  filters?: Filter[];
  columns?: string;
  limit?: number;
  offset?: number;
  search?: { column: string; value?: string };
  statusColumn?: string;
  primaryColumn?: string;
  secondaryColumn?: string;
  amountColumn?: string;
  href?: (row: Record<string, unknown>) => string | null;
  emptyState?: string;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusVariant(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  if (["failed", "cancelled", "disputed", "payout_hold", "open", "critical"].includes(status)) return "destructive";
  if (["approved", "completed", "captured", "paid", "success", "payout_released"].includes(status)) return "success";
  if (["pending", "under_review", "warning", "queued"].includes(status)) return "warning";
  return "secondary";
}

export function RelatedListLoading({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-gray-500">Loading...</p></CardContent>
    </Card>
  );
}

export async function RelatedList({
  title,
  table,
  tenantId,
  filters = [],
  columns = "*",
  limit = 10,
  offset = 0,
  search,
  statusColumn = "status",
  primaryColumn = "title",
  secondaryColumn = "created_at",
  amountColumn,
  href,
  emptyState = "No related records found.",
}: RelatedListProps) {
  const supabase = await createClient();
  let query = supabase
    .from(table)
    .select(columns)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  filters.forEach((filter) => {
    query = filter.value === null ? query.is(filter.column, null) : query.eq(filter.column, filter.value);
  });
  if (search?.value) query = query.ilike(search.column, `%${search.value}%`);

  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-red-600">{error.message}</p>}
        {!error && !rows.length && <p className="text-sm text-gray-500">{emptyState}</p>}
        {rows.map((row) => {
          const link = href?.(row);
          const primary = display(row[primaryColumn] ?? row.id);
          const secondary = secondaryColumn === "created_at" && row.created_at
            ? formatDateTime(String(row.created_at))
            : display(row[secondaryColumn]);
          const amount = amountColumn ? Number(row[amountColumn] ?? 0) : null;
          const content = (
            <div className="rounded-md border p-3 text-sm hover:border-velocity-300">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{primary}</span>
                {row[statusColumn] !== undefined && <Badge variant={statusVariant(row[statusColumn])}>{display(row[statusColumn])}</Badge>}
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>{secondary}</span>
                {amountColumn && <span className="font-medium">{formatCents(amount ?? 0)}</span>}
              </div>
            </div>
          );
          return link ? <Link key={String(row.id)} href={link}>{content}</Link> : <div key={String(row.id)}>{content}</div>;
        })}
        {rows.length >= limit && <p className="text-xs text-gray-400">Showing {offset + 1}-{offset + rows.length}. Use filters or pagination props to narrow this list.</p>}
      </CardContent>
    </Card>
  );
}
