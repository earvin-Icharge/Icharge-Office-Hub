"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, error: { message: string } | null, ok: string): never => {
  revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${error ? `error=${encodeURIComponent(error.message)}` : `ok=${ok}`}`);
};
const rpc = async (fn: string, args: Record<string, unknown>) => (await createClient()).rpc(fn, args);

export async function createCase(f: FormData) {
  const { data, error } = await rpc("create_case", { p: Object.fromEntries(["channel", "type_code", "customer_name", "customer_mobile", "order_no", "kiosk_id", "location", "amount", "business", "message", "owner_id"].map((k) => [k, s(f, k)])) });
  if (error) redirect(`/cs/new?error=${encodeURIComponent(error.message)}`);
  redirect(`/cs/${data}?ok=created`);
}
export async function addMessage(f: FormData) {
  const id = s(f, "id");
  const { error } = await rpc("add_case_message", { p_case: id, p_kind: s(f, "kind"), p_text: s(f, "text"), p_quick: s(f, "quick_id") || null });
  back(`/cs/${id}`, error, "msg");
}
export async function setCaseStatus(f: FormData) {
  const id = s(f, "id");
  back(`/cs/${id}`, (await rpc("set_case_status", { p_case: id, p_status: s(f, "status") })).error, "status");
}
export async function setRating(f: FormData) {
  const id = s(f, "id");
  back(`/cs/${id}`, (await rpc("set_case_rating", { p_case: id, p_rating: Number(s(f, "rating")) })).error, "saved");
}
export async function requestRefund(f: FormData) {
  const id = s(f, "id");
  back(`/cs/${id}`, (await rpc("request_refund", { p_case: id, p_amount: Number(s(f, "amount")), p_method: s(f, "method") })).error, "refund");
}
export async function sendToOps(f: FormData) {
  const id = s(f, "id");
  back(`/cs/${id}`, (await rpc("send_case_to_ops", { p_case: id, p_issue: null })).error, "ops");
}
export async function decideRefund(f: FormData) {
  back("/cs/refunds", (await rpc("decide_refund", { p_id: s(f, "id"), p_approve: s(f, "decision") === "approve", p_note: s(f, "note") })).error, "saved");
}
export async function markPaid(f: FormData) {
  back("/cs/refunds", (await rpc("mark_refund_paid", { p_id: s(f, "id"), p_reference: s(f, "reference") })).error, "saved");
}
export async function saveQuickReply(f: FormData) {
  back("/cs/settings", (await rpc("save_quick_reply", { p_id: s(f, "id") || null, p_language: s(f, "language"), p_title: s(f, "title"), p_text: s(f, "text"), p_active: f.get("active") === "on" || !s(f, "id") })).error, "saved");
}
export async function saveTarget(f: FormData) {
  back("/cs/settings", (await rpc("save_cs_target", { p_kpi: s(f, "kpi"), p_target: Number(s(f, "target")) })).error, "saved");
}
export async function saveQuality(f: FormData) {
  back("/cs/quality", (await rpc("add_quality_review", { p_case: s(f, "case_id"), p_score: Number(s(f, "score")), p_note: s(f, "note") })).error, "saved");
}
