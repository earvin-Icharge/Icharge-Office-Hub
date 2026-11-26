import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDeactivated, languageFor } from "@/lib/auth-rules";
import { DEVICE_COOKIE, LOCALE_COOKIE, SIGNED_IN_COOKIE, deviceCookieOptions, signedInCookieOptions } from "@/lib/session";
import { authSettings, newDeviceKey, readDeviceKey, recordEmailSignIn } from "@/lib/device";

/**
 * Back from "Sign in with Microsoft". Counts like an email code on this device (30-day sign-in, 90-day check).
 * Only @icharge.com.ph accounts get this far (Microsoft app for iCharge only + the database's email-domain rule).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const fail = NextResponse.redirect(new URL("/login?e=microsoft", url.origin));
  if (!code) return fail;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return fail;
  if (await isDeactivated(data.user.email)) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(new URL("/login?e=inactive", url.origin));
  }

  const res = NextResponse.redirect(new URL("/today", url.origin));
  res.cookies.set(SIGNED_IN_COOKIE, new Date().toISOString(), { ...signedInCookieOptions, maxAge: (await authSettings()).sessionDays * 86400 });
  res.cookies.set(LOCALE_COOKIE, await languageFor(data.user.id), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  let key = readDeviceKey(request.cookies);
  if (!key) {
    key = newDeviceKey();
    res.cookies.set(DEVICE_COOKIE, key, deviceCookieOptions);
  }
  await recordEmailSignIn(key, data.user.id, request.headers.get("user-agent")).catch(() => undefined);
  return res;
}
