"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (path: string, error: { message: string } | null, ok: string): never => {
  revalidatePath("/hr/leave");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${error ? `error=${encodeURIComponent(error.message)}` : `ok=${ok}`}`);
};
const rpc = async (fn: string, a: Record<string, unknown>) => (await createClient()).rpc(fn, a);

export async function fileLeave(f: FormData) {
  done("/hr/leave", (await rpc("file_leave", { p_type: s(f, "type_id"), p_start: s(f, "start_date"), p_end: s(f, "end_date") || s(f, "start_date"), p_half: f.get("half_day") === "on", p_reason: s(f, "reason") })).error, "filed");
}
export async function decideLeave(f: FormData) {
  done("/hr/leave", (await rpc("decide_leave", { p_id: s(f, "id"), p_approve: s(f, "decision") === "approve", p_reason: s(f, "reason") })).error, "decided");
}
export async function cancelLeave(f: FormData) {
  done("/hr/leave", (await rpc("cancel_leave", { p_id: s(f, "id") })).error, "cancelled");
}
export async function setBalance(f: FormData) {
  done(`/hr/leave?tab=balances`, (await rpc("set_leave_balance", { p_profile: s(f, "profile_id"), p_type: s(f, "type_id"), p_year: Number(s(f, "year")), p_entitled: Number(s(f, "entitled")), p_adjustment: Number(s(f, "adjustment") || 0), p_note: s(f, "note") })).error, "saved");
}
export async function saveLeaveType(f: FormData) {
  done(`/hr/leave/holidays`, (await rpc("save_leave_type", { p_id: s(f, "id") || null, p: { name: s(f, "name"), yearly_days: Number(s(f, "yearly_days")), paid: f.get("paid") === "on", active: f.get("active") === "on" || !s(f, "id") } })).error, "saved");
}
export async function saveHoliday(f: FormData) {
  done(`/hr/leave/holidays`, (await rpc("save_holiday", { p_day: s(f, "day"), p_name: s(f, "name"), p_kind: s(f, "kind") || "regular", p_delete: s(f, "delete") === "1" })).error, "saved");
}
