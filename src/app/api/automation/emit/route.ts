// POST /api/automation/emit — emit an automation event (admin/internal use)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/automation/emitEvent";
import type { AutomationEventType } from "@/types/automation";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const { event_type, payload, dedup_key } = body as {
    event_type: AutomationEventType;
    payload: Record<string, unknown>;
    dedup_key?: string;
  };

  if (!event_type || !payload) {
    return NextResponse.json({ error: "event_type and payload required" }, { status: 400 });
  }

  try {
    const result = await emitEvent(event_type, payload, dedup_key);
    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
