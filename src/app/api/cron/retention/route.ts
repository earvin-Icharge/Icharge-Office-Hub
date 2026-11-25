import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Daily: delete selfies older than the retention setting (default 90 days). Called by the database with the shared secret. */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = createAdminClient();
  const { data: s } = await db.from("app_settings").select("value").eq("key", "selfie_days").single();
  const cutoff = new Date(Date.now() - Number(s?.value ?? 90) * 86400_000).toISOString();
  const { data: old } = await db.from("attendance_location").select("attendance_id, selfie_path").not("selfie_path", "is", null).lt("selfie_taken_at", cutoff).limit(500);
  const paths = (old ?? []).map((o) => o.selfie_path as string);
  if (paths.length) {
    await db.storage.from("selfies").remove(paths);
    await db.from("attendance_location").update({ selfie_path: null }).in("attendance_id", (old ?? []).map((o) => o.attendance_id));
  }
  return NextResponse.json({ removed: paths.length });
}
