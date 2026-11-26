import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readDeviceKey } from "@/lib/device";
import { SIGNED_IN_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // Signed out on this phone: the Android app stops getting this person's alerts here.
  const { data: { user } } = await supabase.auth.getUser();
  const key = readDeviceKey(request.cookies);
  if (user && key) await createAdminClient().from("fcm_tokens").delete().eq("profile_id", user.id).eq("device_key", key);
  await supabase.auth.signOut({ scope: "local" });
  const res = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  res.cookies.delete(SIGNED_IN_COOKIE);
  return res;
}
