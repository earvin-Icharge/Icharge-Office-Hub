import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_VERSION, BUILD_ID } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Which build is live, the minimum version, and What's new (spec 3.6). Public: holds no private data. */
export async function GET(request: NextRequest) {
  const v = request.nextUrl.searchParams.get("v") ?? APP_VERSION;
  const db = createAdminClient();
  const [{ data: min }, { data: rel }] = await Promise.all([
    db.from("app_releases").select("version, released_at").eq("min_required", true).order("released_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("app_releases").select("version, released_at, whats_new_en, whats_new_zh").eq("version", v).maybeSingle(),
  ]);
  return NextResponse.json(
    { version: APP_VERSION, build: BUILD_ID, minVersion: min?.version ?? null, whatsNew: rel ? { version: rel.version, en: rel.whats_new_en, zh: rel.whats_new_zh } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
