import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_MAX_AGE_SECONDS, SIGNED_IN_COOKIE } from "@/lib/session";

// /api/cron: called by the database, not a signed-in person; each route checks the shared cron secret itself.
// /download: the Android app page and file; /.well-known: lets Android trust the app (Digital Asset Links).
const PUBLIC_PATHS = ["/login", "/auth", "/offline", "/api/version", "/api/cron", "/privacy", "/download", "/.well-known"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { maxAge: SESSION_MAX_AGE_SECONDS },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // Checks the sign-in token on this server (signed with the project's key) instead of asking the sign-in server
  // on every click; it still refreshes the token when it expires.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  // 30-day limit: no sign-in marker means the 30 days are over (or it was never set).
  if (user && !request.cookies.get(SIGNED_IN_COOKIE) && !path.startsWith("/auth")) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectTo("/login");
  }
  if (!user && !isPublic) return redirectTo("/login");
  if (user && path === "/login") return redirectTo("/today");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|mascot/|icons/|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
