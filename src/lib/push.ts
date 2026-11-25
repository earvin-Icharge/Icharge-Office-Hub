import "server-only";
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

/**
 * Sends a phone/computer notification to every subscribed device of a person.
 * Never put restricted data in title/body (spec 7): link into the app instead.
 */
export async function sendPush(profileId: string, payload: { title: string; body: string; url?: string }) {
  if (!setup()) return 0;
  const db = createAdminClient();
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("profile_id", profileId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent;
}
