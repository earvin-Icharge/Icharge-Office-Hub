"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (error: { message: string } | null): never => {
  revalidatePath("/settings");
  redirect(`/settings?${error ? `error=${encodeURIComponent(error.message)}` : "ok=1"}`);
};
const rpc = async (fn: string, a: Record<string, unknown>) => (await createClient()).rpc(fn, a);

/** Values are stored as JSON: numbers, "HH:MM" strings, day lists, true/false, or a person id. */
export async function saveSetting(f: FormData) {
  const key = s(f, "key"), raw = s(f, "value"), type = s(f, "type");
  const value = type === "number" ? (raw === "" ? null : Number(raw)) : type === "days" ? raw.split(/[ ,]+/).filter(Boolean).map(Number)
    : type === "bool" ? f.get("value") === "on" : type === "cs_hours" ? { start: s(f, "start"), end: s(f, "end"), days: s(f, "days").split(/[ ,]+/).filter(Boolean).map(Number) } : raw || null;
  go((await rpc("save_setting", { p_key: key, p_value: value })).error);
}
export async function saveDepartment(f: FormData) {
  go((await rpc("save_department", { p_id: s(f, "id") || null, p_name: s(f, "name"), p_code: s(f, "code") || s(f, "name").toLowerCase().replace(/\W+/g, "_"), p_head: s(f, "head_id") || null })).error);
}
export async function saveDomain(f: FormData) {
  go((await rpc("save_email_domain", { p_domain: s(f, "domain"), p_remove: s(f, "remove") === "1" })).error);
}
export async function saveShift(f: FormData) {
  go((await rpc("save_shift", { p_id: s(f, "id") || null, p_name: s(f, "name"), p_start: s(f, "start_time"), p_end: s(f, "end_time"), p_days: s(f, "days").split(/[ ,]+/).filter(Boolean).map(Number), p_grace: Number(s(f, "grace") || 0) })).error);
}
export async function trashAction(f: FormData) {
  const { error } = await rpc("trash_action", { p_kind: s(f, "kind"), p_id: s(f, "id"), p_restore: s(f, "restore") === "1" });
  revalidatePath("/trash");
  redirect(`/trash?${error ? `error=${encodeURIComponent(error.message)}` : "ok=1"}`);
}
