"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const rpc = async (fn: string, a: Record<string, unknown>) => (await createClient()).rpc(fn, a);
const go = (path: string, error: { message: string } | null, ok: string): never => {
  revalidatePath("/hr/discipline");
  redirect(`${path}?${error ? `error=${encodeURIComponent(error.message)}` : `ok=${ok}`}`);
};

export async function fileIncident(f: FormData) {
  const { data, error } = await rpc("file_incident", { p_profile: s(f, "profile_id"), p_date: s(f, "case_date") || null, p_description: s(f, "description") });
  go(error ? "/hr/discipline" : `/hr/discipline/${data}`, error, "saved");
}
export async function issueDiscipline(f: FormData) {
  const { data, error } = await rpc("issue_discipline", { p_profile: s(f, "profile_id"), p_type: s(f, "type"), p_date: s(f, "case_date") || null, p_description: s(f, "description"),
    p_response_days: Number(s(f, "response_days") || 5), p_parent: s(f, "parent_id") || null });
  go(error ? "/hr/discipline" : `/hr/discipline/${data}`, error, "saved");
}
export async function acknowledge(f: FormData) {
  const id = s(f, "id");
  go(`/hr/discipline/${id}`, (await rpc("acknowledge_discipline", { p_id: id })).error, "ack");
}
export async function respond(f: FormData) {
  const id = s(f, "id");
  go(`/hr/discipline/${id}`, (await rpc("respond_discipline", { p_id: id, p_text: s(f, "text") })).error, "response");
}
export async function decide(f: FormData) {
  const id = s(f, "id");
  go(`/hr/discipline/${id}`, (await rpc("decide_discipline", { p_id: id, p_decision: s(f, "decision"), p_close: f.get("close") === "on" })).error, "saved");
}
