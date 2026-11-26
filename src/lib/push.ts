import "server-only";
import { createSign } from "crypto";
import * as webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let ready = false;
function setup() {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:noreply@icharge.com.ph", pub, priv);
  ready = true;
  return true;
}

// ---------------------------------------------------------------- Android app (Firebase Cloud Messaging)

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let account: ServiceAccount | null | undefined;
let accessToken: { value: string; expires: number } | null = null;

function serviceAccount() {
  if (account !== undefined) return account;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const a = raw ? (JSON.parse(raw) as ServiceAccount) : null;
    account = a?.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    account = null;
  }
  return account;
}

async function fcmAccessToken(a: ServiceAccount) {
  if (accessToken && accessToken.expires > Date.now() + 60_000) return accessToken.value;
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({
    iss: a.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(a.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!r.ok) throw new Error(`Firebase sign-in failed (${r.status})`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  accessToken = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return accessToken.value;
}

/** One alert to one app install. `gone` = the app was removed or signed out of alerts: forget the token. */
export async function sendFcm(token: string, payload: { title: string; body: string; url?: string }, validateOnly = false) {
  const a = serviceAccount();
  if (!a) return { ok: false, gone: false, status: 0, error: "not configured" };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await fcmAccessToken(a)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      validate_only: validateOnly,
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? "/today" },
        android: { priority: "HIGH", ttl: "86400s", notification: { channel_id: "officehub", icon: "ic_notification_icon", color: "#8FD220", default_sound: true } },
      },
    }),
  });
  if (r.ok) return { ok: true, gone: false, status: r.status, error: "" };
  const text = await r.text();
  const gone = r.status === 404 || text.includes("UNREGISTERED") || (r.status === 400 && text.includes("registration token"));
  return { ok: false, gone, status: r.status, error: text.slice(0, 300) };
}

/**
 * Sends a phone/computer notification to every device of a person: browsers (web push) and the Android app (Firebase).
 * Never put restricted data in title/body (spec 7): link into the app instead.
 */
export async function sendPush(profileId: string, payload: { title: string; body: string; url?: string }) {
  const db = createAdminClient();
  let sent = 0;
  if (setup()) {
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("profile_id", profileId);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  if (serviceAccount()) {
    const { data: tokens } = await db.from("fcm_tokens").select("token").eq("profile_id", profileId);
    for (const t of tokens ?? []) {
      try {
        const r = await sendFcm(t.token, payload);
        if (r.ok) sent++;
        else if (r.gone) await db.from("fcm_tokens").delete().eq("token", t.token);
      } catch {
        /* Firebase unreachable: the bell and email still carry it */
      }
    }
  }
  return sent;
}
