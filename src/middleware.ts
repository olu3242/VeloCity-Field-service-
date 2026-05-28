import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createCorrelationId } from "@/runtime/telemetry/correlation";

export async function middleware(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") ?? createCorrelationId("req");
  const response = await updateSession(request);
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
