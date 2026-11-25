"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromManilaInput } from "@/lib/time";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** One-time upload link for a live selfie (private "selfies" bucket). */
export async function startSelfieUpload() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "signedOut" };
  const path = `${user.id}/${randomUUID()}.jpg`;
  const { data, error } = await createAdminClient().storage.from("selfies").createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, error: error?.message ?? "upload" };
  return { ok: true as const, path, token: data.token };
}

export type ClockPayload = { mode?: string; field_site_id?: string; field_other_reason?: string; lat?: number | null; lng?: number | null; accuracy?: number | null; device_time?: string | null; selfie_path?: string | null; reason?: string };

export async function clockIn(p: ClockPayload) {
  const { data, error } = await (await createClient()).rpc("time_in", { p });
  revalidatePath("/hr/attendance");
  return error ? { ok: false as const, error: error.message } : { ok: true as const, id: data as string };
}
export async function clockOut(p: ClockPayload) {
  const { error } = await (await createClient()).rpc("time_out", { p });
  revalidatePath("/hr/attendance");
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function reviewAttendance(f: FormData) {
  const { error } = await (await createClient()).rpc("review_attendance", { p_id: s(f, "id"), p_note: s(f, "note") });
  revalidatePath("/hr/attendance");
  redirect(`/hr/attendance?tab=${s(f, "tab") || "flags"}&${error ? `error=${encodeURIComponent(error.message)}` : "ok=reviewed"}`);
}
export async function correctAttendance(f: FormData) {
  const { error } = await (await createClient()).rpc("correct_attendance", { p_id: s(f, "id"), p_reason: s(f, "reason"), p: {
    time_in: fromManilaInput(s(f, "time_in")), time_out: fromManilaInput(s(f, "time_out")) ?? "", late_minutes: s(f, "late_minutes"), undertime_minutes: s(f, "undertime_minutes"),
  } });
  revalidatePath("/hr/attendance");
  redirect(`/hr/attendance?tab=${s(f, "tab") || "all"}&${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}
/** HR / Leader (logged) or the employee: open the selfie through a 60-second link. */
export async function openProof(f: FormData) {
  const { data, error } = await (await createClient()).rpc("get_attendance_location", { p_attendance: s(f, "id") });
  if (error || !data) redirect(`/hr/attendance?error=${encodeURIComponent(error?.message ?? "Not found")}`);
  const loc = data as { selfie_path: string | null; in_lat: number | null; in_lng: number | null };
  if (loc.selfie_path) {
    const { data: u } = await createAdminClient().storage.from("selfies").createSignedUrl(loc.selfie_path, 60);
    if (u?.signedUrl) redirect(u.signedUrl);
  }
  if (loc.in_lat != null) redirect(`https://www.openstreetmap.org/?mlat=${loc.in_lat}&mlon=${loc.in_lng}#map=17/${loc.in_lat}/${loc.in_lng}`);
  redirect("/hr/attendance?error=" + encodeURIComponent("No selfie or GPS point kept for this record."));
}
export async function saveFieldSite(f: FormData) {
  const { error } = await (await createClient()).rpc("save_field_site", { p_id: s(f, "id") || null, p: {
    name: s(f, "name"), business: s(f, "business"), kiosk_id: s(f, "kiosk_id"), lat: Number(s(f, "lat")), lng: Number(s(f, "lng")), radius_m: s(f, "radius_m"), active: f.get("active") === "on" || !s(f, "id"),
  } });
  redirect(`/hr/attendance/sites?${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}
export async function saveOfficePin(f: FormData) {
  const { error } = await (await createClient()).rpc("save_office_pin", { p_name: s(f, "name"), p_lat: Number(s(f, "lat")), p_lng: Number(s(f, "lng")), p_radius: Number(s(f, "radius_m") || 200) });
  redirect(`/hr/attendance/sites?${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}
export async function requestWfh(address: string, lat: number, lng: number) {
  const { error } = await (await createClient()).rpc("request_wfh_change", { p_address: address, p_lat: lat, p_lng: lng });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
