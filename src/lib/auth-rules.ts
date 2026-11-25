import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_WRONG_CODES = 5;
export const RESEND_SECONDS = 60;

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function looksLikeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Server-side domain check against Settings › allowed email domains (spec 3.5). */
export async function isAllowedDomain(email: string) {
  const domain = email.split("@")[1] ?? "";
  const admin = createAdminClient();
  const { data } = await admin.from("allowed_email_domains").select("domain").eq("domain", domain).maybeSingle();
  return !!data;
}

export async function getAttempts(email: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("otp_attempts")
    .select("failed_count, locked_until, last_sent_at")
    .eq("email", email)
    .maybeSingle<{ failed_count: number; locked_until: string | null; last_sent_at: string | null }>();
  return data;
}

export function minutesLeft(until: string | null | undefined) {
  if (!until) return 0;
  const ms = new Date(until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export async function isDeactivated(email: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("active").eq("email", email).maybeSingle<{ active: boolean }>();
  return data ? !data.active : false;
}

export async function markCodeSent(email: string) {
  const admin = createAdminClient();
  await admin
    .from("otp_attempts")
    .upsert({ email, last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "email" });
}

export async function registerFailure(email: string) {
  const admin = createAdminClient();
  const { data } = await admin.rpc("otp_register_failure", { p_email: email });
  const row = (Array.isArray(data) ? data[0] : data) as { out_failed: number; out_locked_until: string | null } | undefined;
  return { failed: row?.out_failed ?? 0, lockedUntil: row?.out_locked_until ?? null };
}

export async function clearAttempts(email: string) {
  const admin = createAdminClient();
  await admin.from("otp_attempts").update({ failed_count: 0, locked_until: null }).eq("email", email);
}

export async function languageFor(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("language").eq("id", userId).maybeSingle<{ language: string }>();
  return data?.language === "zh-Hans" ? "zh-Hans" : "en";
}
