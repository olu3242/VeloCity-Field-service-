import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // Skip middleware entirely if Supabase is not configured
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protect all authenticated portal routes
  const protectedPaths = ["/dashboard", "/provider", "/admin", "/dispatch", "/franchise"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Role-gate each portal
  const roleProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/provider") ||
    pathname.startsWith("/dispatch") ||
    pathname.startsWith("/franchise");

  if (user && roleProtected) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = profile?.role;
    if (pathname.startsWith("/admin") && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname.startsWith("/provider") && role !== "provider") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname.startsWith("/dispatch") && role !== "dispatcher" && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname.startsWith("/franchise") && role !== "franchise_owner" && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Redirect logged-in users away from auth pages
  if (user && (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/signup"))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
