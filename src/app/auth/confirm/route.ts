import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { languageFor } from "@/lib/auth-rules";
import { DEVICE_COOKIE, LOCALE_COOKIE, SIGNED_IN_COOKIE, deviceCookieOptions, signedInCookieOptions } from "@/lib/session";
import { newDeviceKey, readDeviceKey, recordEmailSignIn } from "@/lib/device";

/** Opens a one-time sign-in link (used by the builder's test-login script for the test accounts). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const fail = NextResponse.redirect(new URL("/login?e=link", url.origin));
  if (!tokenHash) return fail;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return fail;

  const res = NextResponse.redirect(new URL("/today", url.origin));
  res.cookies.set(SIGNED_IN_COOKIE, new Date().toISOString(), signedInCookieOptions);
  res.cookies.set(LOCALE_COOKIE, await languageFor(data.user.id), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  let key = readDeviceKey(request.cookies);
  if (!key) {
    key = newDeviceKey();
    res.cookies.set(DEVICE_COOKIE, key, deviceCookieOptions);
  }
  await recordEmailSignIn(key, data.user.id, request.headers.get("user-agent")).catch(() => undefined);
  return res;
}
