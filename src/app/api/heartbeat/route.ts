import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authSettings, deviceGate, deviceNameFrom, getDevice, newDeviceKey, readDeviceKey } from "@/lib/device";
import { DEVICE_COOKIE, SIGNED_IN_COOKIE, deviceCookieOptions } from "@/lib/session";

/**
 * Called by the open app on start, every few minutes and when it comes back to the screen.
 * Tells the app if it must lock (12 h), sign in again (removed device / 90 days), and
 * records the app version for Settings › App updates.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ gate: "signedOut" });
  const { data: profile } = await supabase.from("profiles").select("id, active").eq("id", user.id).maybeSingle();
  if (!profile?.active) return NextResponse.json({ gate: "inactive" });

  const body = (await request.json().catch(() => ({}))) as { version?: string };
  const version = typeof body.version === "string" ? body.version.slice(0, 20) : null;
  const ua = request.headers.get("user-agent");
  let key = readDeviceKey(request.cookies);
  const res = NextResponse.json({ gate: "ok" });
  if (!key) {
    key = newDeviceKey();
    res.cookies.set(DEVICE_COOKIE, key, deviceCookieOptions);
  }

  const db = createAdminClient();
  const device = await getDevice(key, user.id);
  if (!device) {
    await db.from("user_devices").insert({
      device_key: key, profile_id: user.id, device_name: deviceNameFrom(ua), app_version: version,
      last_email_code_at: request.cookies.get(SIGNED_IN_COOKIE)?.value ?? new Date().toISOString(),
    });
    return res;
  }
  const gate = deviceGate(device, await authSettings());
  if (gate !== "ok") return NextResponse.json({ gate });
  await db.from("user_devices").update({ last_seen_at: new Date().toISOString(), app_version: version, device_name: deviceNameFrom(ua) }).eq("id", device.id);
  return res;
}
