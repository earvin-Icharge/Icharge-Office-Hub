import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Open a notification: mark it read and go to its page. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("url").eq("id", id).maybeSingle();
  await supabase.rpc("mark_notifications_read", { p_ids: [id] });
  const url = data?.url?.startsWith("/") ? data.url : "/notifications";
  return NextResponse.redirect(new URL(url, request.nextUrl.origin));
}
