"use server";

import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { deviceNameFrom, getDevice, newDeviceKey, quickMethodOf, readDeviceKey, touchDevice, type DeviceRow } from "@/lib/device";
import { checkPin, hashPin, pinProblem } from "@/lib/pin";
import { sendPush } from "@/lib/push";
import { CHALLENGE_COOKIE, challengeCookieOptions, relyingParty } from "@/lib/webauthn";
import { DEVICE_COOKIE, MAX_WRONG_PINS, SIGNED_IN_COOKIE, deviceCookieOptions } from "@/lib/session";

type Fail = { ok: false; error: string; triesLeft?: number };
type Ok<T = object> = { ok: true } & T;

/** The signed-in, active person and this device's row (created if missing). */
async function me() {
  const viewer = await getViewer();
  if (!viewer?.active) return null;
  const store = await cookies();
  let key = readDeviceKey(store);
  if (!key) {
    key = newDeviceKey();
    store.set(DEVICE_COOKIE, key, deviceCookieOptions);
  }
  let device = await getDevice(key, viewer.id);
  if (!device) {
    const ua = (await headers()).get("user-agent");
    const since = store.get(SIGNED_IN_COOKIE)?.value ?? new Date().toISOString();
    await createAdminClient().from("user_devices").insert({ device_key: key, profile_id: viewer.id, device_name: deviceNameFrom(ua), last_email_code_at: since });
    device = await getDevice(key, viewer.id);
  }
  if (!device || device.removed_at) return null;
  return { viewer, device, key };
}

async function saveQuick(device: DeviceRow, fields: Partial<DeviceRow>) {
  const next = { ...device, ...fields };
  await createAdminClient().from("user_devices").update({ ...fields, quick_method: quickMethodOf(next) }).eq("id", device.id);
}

async function audit(actor: string, action: string, subject: string, detail: Record<string, unknown>) {
  await createAdminClient().from("audit_log").insert({ actor_id: actor, action, table_name: "user_devices", subject_profile_id: subject, new: detail });
}

async function takeChallenge() {
  const store = await cookies();
  const c = store.get(CHALLENGE_COOKIE)?.value;
  store.delete(CHALLENGE_COOKIE);
  return c;
}

// ---------------------------------------------------------------- set up (signed in)

export async function passkeyRegisterOptions() {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" } as Fail;
  const rp = await relyingParty();
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: m.viewer.email,
    userDisplayName: m.viewer.name,
    userID: new TextEncoder().encode(m.viewer.id),
    attestationType: "none",
    excludeCredentials: m.device.passkey_credential_id ? [{ id: m.device.passkey_credential_id }] : [],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
  });
  (await cookies()).set(CHALLENGE_COOKIE, options.challenge, challengeCookieOptions);
  return { ok: true, options } as Ok<{ options: typeof options }>;
}

export async function passkeyRegisterVerify(response: RegistrationResponseJSON): Promise<Ok | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  const challenge = await takeChallenge();
  if (!challenge) return { ok: false, error: "expired" };
  const rp = await relyingParty();
  try {
    const v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true });
    if (!v.verified) return { ok: false, error: "notVerified" };
    const c = v.registrationInfo.credential;
    await saveQuick(m.device, { passkey_credential_id: c.id, passkey_public_key: Buffer.from(c.publicKey).toString("base64url"), passkey_counter: c.counter });
    await audit(m.viewer.id, "quick_signin_passkey_added", m.viewer.id, { device: m.device.device_name });
    return { ok: true };
  } catch {
    return { ok: false, error: "notVerified" };
  }
}

export async function setPin(pin: string, confirm: string): Promise<Ok | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  const problem = pinProblem(pin);
  if (problem) return { ok: false, error: problem };
  if (pin !== confirm) return { ok: false, error: "pinMismatch" };
  await saveQuick(m.device, { pin_hash: hashPin(pin), failed_pins: 0 });
  await audit(m.viewer.id, "quick_signin_pin_set", m.viewer.id, { device: m.device.device_name });
  return { ok: true };
}

export async function removeQuickSignIn(): Promise<Ok | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  await saveQuick(m.device, { passkey_credential_id: null, passkey_public_key: null, passkey_counter: 0, pin_hash: null, failed_pins: 0 });
  await audit(m.viewer.id, "quick_signin_removed", m.viewer.id, { device: m.device.device_name });
  return { ok: true };
}

// ---------------------------------------------------------------- unlock (app locked after 12 h)

export async function passkeyAuthOptions() {
  const m = await me();
  if (!m?.device.passkey_credential_id) return { ok: false, error: "noPasskey" } as Fail;
  const rp = await relyingParty();
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, allowCredentials: [{ id: m.device.passkey_credential_id }], userVerification: "required" });
  (await cookies()).set(CHALLENGE_COOKIE, options.challenge, challengeCookieOptions);
  return { ok: true, options } as Ok<{ options: typeof options }>;
}

export async function passkeyAuthVerify(response: AuthenticationResponseJSON): Promise<Ok | Fail> {
  const m = await me();
  if (!m?.device.passkey_credential_id || !m.device.passkey_public_key) return { ok: false, error: "noPasskey" };
  const challenge = await takeChallenge();
  if (!challenge) return { ok: false, error: "expired" };
  const rp = await relyingParty();
  try {
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true,
      credential: { id: m.device.passkey_credential_id, publicKey: new Uint8Array(Buffer.from(m.device.passkey_public_key, "base64url")), counter: Number(m.device.passkey_counter) },
    });
    if (!v.verified) return { ok: false, error: "notVerified" };
    await touchDevice(m.device.id, { passkey_counter: v.authenticationInfo.newCounter, failed_pins: 0 });
    return { ok: true };
  } catch {
    return { ok: false, error: "notVerified" };
  }
}

export async function unlockWithPin(pin: string): Promise<Ok | Fail> {
  const m = await me();
  if (!m?.device.pin_hash) return { ok: false, error: "noPin" };
  if (checkPin(pin, m.device.pin_hash)) {
    await touchDevice(m.device.id, { failed_pins: 0 });
    return { ok: true };
  }
  const failed = m.device.failed_pins + 1;
  if (failed >= MAX_WRONG_PINS) {
    // 5 wrong PINs: the PIN is removed on this device and an email code is needed (spec 3.5).
    await saveQuick(m.device, { pin_hash: null, failed_pins: 0 });
    await audit(m.viewer.id, "quick_signin_pin_locked", m.viewer.id, { device: m.device.device_name });
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
    (await cookies()).delete(SIGNED_IN_COOKIE);
    return { ok: false, error: "pinLocked" };
  }
  await createAdminClient().from("user_devices").update({ failed_pins: failed }).eq("id", m.device.id);
  return { ok: false, error: "wrongPin", triesLeft: MAX_WRONG_PINS - failed };
}

// ---------------------------------------------------------------- my devices

export async function removeMyDevice(deviceId: string): Promise<Ok<{ signedOut: boolean }> | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  const db = createAdminClient();
  const { data: d } = await db.from("user_devices").select("id, device_key, device_name").eq("id", deviceId).eq("profile_id", m.viewer.id).maybeSingle();
  if (!d) return { ok: false, error: "notFound" };
  await db.from("user_devices").update({ removed_at: new Date().toISOString(), passkey_credential_id: null, passkey_public_key: null, pin_hash: null, quick_method: null }).eq("id", d.id);
  await db.from("push_subscriptions").delete().eq("profile_id", m.viewer.id).eq("device_key", d.device_key);
  await db.from("fcm_tokens").delete().eq("profile_id", m.viewer.id).eq("device_key", d.device_key);
  await audit(m.viewer.id, "device_removed", m.viewer.id, { device: d.device_name });
  const isThis = d.device_key === m.key;
  if (isThis) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
    (await cookies()).delete(SIGNED_IN_COOKIE);
  }
  return { ok: true, signedOut: isThis };
}

// ---------------------------------------------------------------- phone notifications

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Ok | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  if (!sub?.endpoint?.startsWith("https://")) return { ok: false, error: "badSubscription" };
  await createAdminClient().from("push_subscriptions").upsert(
    { profile_id: m.viewer.id, device_key: m.key, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { onConflict: "endpoint" },
  );
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Ok | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("profile_id", m.viewer.id);
  return { ok: true };
}

/** Android app: save this install's alert token (called when alerts are turned on and each time the app opens). */
export async function saveFcmToken(token: string): Promise<Ok | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) return { ok: false, error: "badToken" };
  await createAdminClient().from("fcm_tokens").upsert(
    { token, profile_id: m.viewer.id, device_key: m.key, last_seen_at: new Date().toISOString() },
    { onConflict: "token" },
  );
  return { ok: true };
}

export async function removeFcmToken(token: string): Promise<Ok | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  await createAdminClient().from("fcm_tokens").delete().eq("token", token).eq("profile_id", m.viewer.id);
  return { ok: true };
}

export async function sendTestPush(title: string, body: string): Promise<Ok<{ sent: number }> | Fail> {
  const m = await me();
  if (!m) return { ok: false, error: "signedOut" };
  const sent = await sendPush(m.viewer.id, { title, body, url: "/profile" });
  return { ok: true, sent };
}
