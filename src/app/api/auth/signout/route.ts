import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", env.appUrl));
}
