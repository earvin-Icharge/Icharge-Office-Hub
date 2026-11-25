import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";
import { APP_ONLY_KINDS, sendEmail } from "@/lib/channels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function inQuietHours() {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h >= 21 || h < 7; // 9:00 pm – 7:00 am: only Urgent goes out (spec 7)
}

/**
 * Called every minute by the database (pg_cron + pg_net) with a shared secret.
 * Sends new notifications as push and email, and invite emails.
 * Notifications never carry restricted data; they link into the app.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const db = createAdminClient();
  const base = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https") ? process.env.NEXT_PUBLIC_SITE_URL : "https://icharge-office-hub.vercel.app";
  const quiet = inQuietHours();
  const { data: rows } = await db
    .from("notifications")
    .select("id, profile_id, kind, title, body, url, urgent, created_at, profile:profiles!notifications_profile_id_fkey(email, active, notify_email)")
    .is("delivered_at", null)
    .order("created_at")
    .limit(200);

  let sent = 0;
  for (const n of rows ?? []) {
    const p = n.profile as unknown as { email: string; active: boolean; notify_email: boolean } | null;
    const stale = Date.now() - new Date(n.created_at).getTime() > 24 * 3600_000;
    if (!stale && quiet && !n.urgent) continue; // wait for 7:00 am
    const channels: string[] = [];
    if (!stale && p?.active) {
      const link = `${base}${n.url ?? "/today"}`;
      if ((await sendPush(n.profile_id, { title: n.title, body: n.body ?? "", url: n.url ?? "/today" })) > 0) channels.push("push");
      if (!APP_ONLY_KINDS.has(n.kind)) {
        const text = `${n.title}\n${n.body ? `${n.body}\n` : ""}\n${link}`;
        if (p.notify_email && (await sendEmail(p.email, n.title, `${text}\n\n— iCharge Office Hub`))) channels.push("email");
      }
    }
    await db.from("notifications").update({ delivered_at: new Date().toISOString(), channels }).eq("id", n.id);
    sent++;
  }

  const { data: emails } = await db.from("outbound_emails").select("id, to_email, subject, body").is("sent_at", null).is("error", null).limit(50);
  for (const e of emails ?? []) {
    const ok = await sendEmail(e.to_email, e.subject, e.body);
    await db.from("outbound_emails").update(ok ? { sent_at: new Date().toISOString() } : { error: process.env.RESEND_API_KEY ? "send failed" : "email not set up yet" }).eq("id", e.id);
  }
  return NextResponse.json({ delivered: sent, emails: emails?.length ?? 0 });
}
