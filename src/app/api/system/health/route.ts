import { NextResponse } from "next/server";
import { getSystemHealth } from "@/runtime/health/system-health";

export async function GET() {
  try {
    const health = await getSystemHealth();
    const status = health.status === "down" ? 503 : health.status === "degraded" ? 207 : 200;
    return NextResponse.json({ success: true, data: health }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({
      success: false,
      error: message,
      data: {
        status: "down",
        timestamp: new Date().toISOString(),
      },
    }, { status: 503 });
  }
}
