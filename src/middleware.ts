import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// In-memory rate limiter — module-level singleton (per serverless instance)
// Uses a sliding window keyed by IP + route bucket.
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

type RateLimitBucket = {
  windowMs: number;
  max: number;
};

function getRateLimitBucket(pathname: string): RateLimitBucket | null {
  // Only rate-limit API routes
  if (!pathname.startsWith("/api/")) return null;

  // Auth / high-value routes — tightest limit
  if (
    pathname.startsWith("/api/automation/emit") ||
    pathname.startsWith("/api/payments/")
  ) {
    return { windowMs: 60_000, max: 10 };
  }

  // Stripe webhooks
  if (pathname.startsWith("/api/webhooks/")) {
    return { windowMs: 60_000, max: 30 };
  }

  // General API
  return { windowMs: 60_000, max: 60 };
}

function checkRateLimit(key: string, bucket: RateLimitBucket): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= bucket.windowMs) {
    // Start a fresh window
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true; // allowed
  }

  entry.count += 1;
  if (entry.count > bucket.max) {
    return false; // rate limited
  }
  return true; // allowed
}

// ---------------------------------------------------------------------------
// Security headers applied to every response
// ---------------------------------------------------------------------------
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set("X-XSS-Protection", "1; mode=block");
  return response;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware entirely if Supabase is not configured
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    const res = NextResponse.next({ request });
    return applySecurityHeaders(res);
  }

  // ------------------------------------------------------------------
  // Rate limiting — only for /api/* routes
  // ------------------------------------------------------------------
  const bucket = getRateLimitBucket(pathname);
  if (bucket) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      "unknown";
    const key = `${ip}:${pathname}`;
    const allowed = checkRateLimit(key, bucket);

    if (!allowed) {
      const tooManyRes = new NextResponse(
        JSON.stringify({ error: "Too Many Requests", retryAfter: 60 }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
      return applySecurityHeaders(tooManyRes);
    }
  }

  // ------------------------------------------------------------------
  // Supabase auth session handling
  // ------------------------------------------------------------------
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect all authenticated portal routes
  const protectedPaths = [
    "/dashboard",
    "/provider",
    "/admin",
    "/dispatch",
    "/franchise",
  ];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const redirectRes = NextResponse.redirect(
      new URL("/auth/login", request.url)
    );
    return applySecurityHeaders(redirectRes);
  }

  // Role-gate each portal
  const roleProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/provider") ||
    pathname.startsWith("/dispatch") ||
    pathname.startsWith("/franchise");

  if (user && roleProtected) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = profile?.role;

    if (
      pathname.startsWith("/admin") &&
      role !== "admin" &&
      role !== "super_admin"
    ) {
      const redirectRes = NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
      return applySecurityHeaders(redirectRes);
    }
    if (pathname.startsWith("/provider") && role !== "provider") {
      const redirectRes = NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
      return applySecurityHeaders(redirectRes);
    }
    if (
      pathname.startsWith("/dispatch") &&
      role !== "dispatcher" &&
      role !== "admin" &&
      role !== "super_admin"
    ) {
      const redirectRes = NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
      return applySecurityHeaders(redirectRes);
    }
    if (
      pathname.startsWith("/franchise") &&
      role !== "franchise_owner" &&
      role !== "admin" &&
      role !== "super_admin"
    ) {
      const redirectRes = NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
      return applySecurityHeaders(redirectRes);
    }
  }

  // Redirect logged-in users away from auth pages
  if (
    user &&
    (pathname.startsWith("/auth/login") ||
      pathname.startsWith("/auth/signup"))
  ) {
    const redirectRes = NextResponse.redirect(
      new URL("/dashboard", request.url)
    );
    return applySecurityHeaders(redirectRes);
  }

  return applySecurityHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
