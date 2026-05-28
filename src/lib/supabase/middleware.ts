import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

const AUTH_ROUTES = ["/auth/login", "/auth/signup"];
const PUBLIC_AUTH_ROUTES = ["/auth/callback", "/api/auth/callback"];
const PROTECTED_PREFIXES = ["/dashboard", "/provider", "/admin"];
const ONBOARDING_PREFIXES = ["/onboarding", "/provider/apply"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function redirectTo(request: NextRequest, pathname: string) {
  return NextResponse.redirect(new URL(pathname, request.url));
}

export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();
  const { pathname } = request.nextUrl;

  if (!config || startsWithAny(pathname, PUBLIC_AUTH_ROUTES)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = startsWithAny(pathname, PROTECTED_PREFIXES);
  const isAuthPage = startsWithAny(pathname, AUTH_ROUTES);
  const isOnboarding = startsWithAny(pathname, ONBOARDING_PREFIXES);

  if (isProtected && !isOnboarding && !user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthPage) {
    return redirectTo(request, "/dashboard");
  }

  if (user && startsWithAny(pathname, ["/admin", "/provider/dashboard", "/provider/jobs", "/provider/earnings"])) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (pathname.startsWith("/admin") && profile?.role !== "admin") {
      return redirectTo(request, "/dashboard");
    }

    if (pathname.startsWith("/provider") && profile?.role !== "provider") {
      return redirectTo(request, "/dashboard");
    }
  }

  return supabaseResponse;
}
