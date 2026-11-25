"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_WRONG_CODES, RESEND_SECONDS, clearAttempts, getAttempts, isAllowedDomain, isDeactivated,
  languageFor, looksLikeEmail, markCodeSent, minutesLeft, normalizeEmail, registerFailure,
} from "@/lib/auth-rules";
import { LOCALE_COOKIE, SIGNED_IN_COOKIE, signedInCookieOptions } from "@/lib/session";

export type SendResult =
  | { ok: true; email: string; triesLeft: number }
  | { ok: false; error: "invalidEmail" | "wrongDomain" | "inactive" | "sendFailed" }
  | { ok: false; error: "locked"; minutes: number }
  | { ok: false; error: "wait"; seconds: number };

export async function sendCode(rawEmail: string): Promise<SendResult> {
  const email = normalizeEmail(rawEmail);
  if (!looksLikeEmail(email)) return { ok: false, error: "invalidEmail" };
  if (!(await isAllowedDomain(email))) return { ok: false, error: "wrongDomain" };
  if (await isDeactivated(email)) return { ok: false, error: "inactive" };

  const attempts = await getAttempts(email);
  const lockedMin = minutesLeft(attempts?.locked_until);
  if (lockedMin > 0) return { ok: false, error: "locked", minutes: lockedMin };
  if (attempts?.last_sent_at) {
    const since = (Date.now() - new Date(attempts.last_sent_at).getTime()) / 1000;
    if (since < RESEND_SECONDS) return { ok: false, error: "wait", seconds: Math.ceil(RESEND_SECONDS - since) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    // The before-user-created hook refuses other domains with a 403.
    if (error.status === 403 || /iCharge work email/i.test(error.message)) return { ok: false, error: "wrongDomain" };
    if (error.status === 429) return { ok: false, error: "wait", seconds: RESEND_SECONDS };
    console.error("sendCode failed", error.status, error.message);
    return { ok: false, error: "sendFailed" };
  }
  await markCodeSent(email);
  return { ok: true, email, triesLeft: MAX_WRONG_CODES - (attempts?.failed_count ?? 0) };
}

export type VerifyResult =
  | { ok: false; error: "codeFormat" }
  | { ok: false; error: "locked"; minutes: number }
  | { ok: false; error: "wrongCode"; triesLeft: number };

export async function verifyCode(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "codeFormat" };

  const attempts = await getAttempts(email);
  const lockedMin = minutesLeft(attempts?.locked_until);
  if (lockedMin > 0) return { ok: false, error: "locked", minutes: lockedMin };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    const { failed, lockedUntil } = await registerFailure(email);
    const minutes = minutesLeft(lockedUntil);
    if (minutes > 0) return { ok: false, error: "locked", minutes };
    return { ok: false, error: "wrongCode", triesLeft: Math.max(0, MAX_WRONG_CODES - failed) };
  }

  await clearAttempts(email);
  const store = await cookies();
  store.set(SIGNED_IN_COOKIE, new Date().toISOString(), signedInCookieOptions);
  store.set(LOCALE_COOKIE, await languageFor(data.user.id), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/today");
}

/** Language switch on the sign-in page (before there is a profile). */
export async function setLoginLanguage(locale: "en" | "zh-Hans") {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale === "zh-Hans" ? "zh-Hans" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
