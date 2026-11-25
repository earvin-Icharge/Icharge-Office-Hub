import "server-only";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cache } from "react";
import { DEVICE_COOKIE, EMAIL_CODE_EVERY_DAYS, LOCK_AFTER_HOURS } from "@/lib/session";

export type DeviceRow = {
  id: string;
  device_key: string;
  profile_id: string;
  device_name: string | null;
  quick_method: "passkey" | "pin" | "both" | null;
  passkey_credential_id: string | null;
  passkey_public_key: string | null;
  passkey_counter: number;
  pin_hash: string | null;
  failed_pins: number;
  last_email_code_at: string;
  last_seen_at: string;
  app_version: string | null;
  removed_at: string | null;
};

type CookieReader = { get(name: string): { value: string } | undefined };

export function readDeviceKey(store: CookieReader) {
  return store.get(DEVICE_COOKIE)?.value ?? null;
}

export function newDeviceKey() {
  return randomUUID();
}

/** A short readable name like "iPhone · Safari" or "Windows · Chrome". */
export function deviceNameFrom(ua: string | null) {
  const s = ua ?? "";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "Device";
  const br = /Edg\//.test(s) ? "Edge" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /CriOS|Chrome\//.test(s) ? "Chrome" : /FxiOS|Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "Browser";
  return `${os} · ${br}`;
}

export function quickMethodOf(d: { passkey_credential_id: string | null; pin_hash: string | null }) {
  if (d.passkey_credential_id && d.pin_hash) return "both" as const;
  if (d.passkey_credential_id) return "passkey" as const;
  if (d.pin_hash) return "pin" as const;
  return null;
}

export async function getDevice(deviceKey: string | null, profileId: string): Promise<DeviceRow | null> {
  if (!deviceKey) return null;
  const { data } = await createAdminClient()
    .from("user_devices")
    .select("*")
    .eq("device_key", deviceKey)
    .eq("profile_id", profileId)
    .maybeSingle<DeviceRow>();
  return data;
}

/** After an email code: this device is trusted again for 90 days (spec 3.5). */
export async function recordEmailSignIn(deviceKey: string, profileId: string, ua: string | null) {
  const now = new Date().toISOString();
  await createAdminClient()
    .from("user_devices")
    .upsert(
      { device_key: deviceKey, profile_id: profileId, device_name: deviceNameFrom(ua), last_email_code_at: now, last_seen_at: now, removed_at: null, failed_pins: 0 },
      { onConflict: "device_key,profile_id" },
    );
}

export type AuthSettings = { lockHours: number; emailCodeDays: number; sessionDays: number };

/** Quick sign-in rules from Settings (Leader): lock after 12 h, email code every 90 days, stay signed in 30 days. */
export const authSettings = cache(async (): Promise<AuthSettings> => {
  const { data } = await createAdminClient().from("app_settings").select("key, value").in("key", ["lock_hours", "email_code_days", "session_days"]);
  const v = (k: string, d: number) => Number(data?.find((x) => x.key === k)?.value ?? d) || d;
  return { lockHours: v("lock_hours", LOCK_AFTER_HOURS), emailCodeDays: v("email_code_days", EMAIL_CODE_EVERY_DAYS), sessionDays: v("session_days", 30) };
});

/** What this device must do before the app opens. */
export function deviceGate(d: DeviceRow | null, s: AuthSettings = { lockHours: LOCK_AFTER_HOURS, emailCodeDays: EMAIL_CODE_EVERY_DAYS, sessionDays: 30 }): "ok" | "reauth" | "unlock" {
  if (!d) return "ok";
  if (d.removed_at) return "reauth";
  if (Date.now() - new Date(d.last_email_code_at).getTime() > s.emailCodeDays * 86400_000) return "reauth";
  if (d.quick_method && Date.now() - new Date(d.last_seen_at).getTime() > s.lockHours * 3600_000) return "unlock";
  return "ok";
}

export async function touchDevice(id: string, fields: Record<string, unknown> = {}) {
  await createAdminClient().from("user_devices").update({ last_seen_at: new Date().toISOString(), ...fields }).eq("id", id);
}
