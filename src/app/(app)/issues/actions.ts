"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string, error: { message: string } | null, ok: string): never => {
  revalidatePath(`/issues/${id}`);
  redirect(`/issues/${id}?${error ? `error=${encodeURIComponent(error.message)}` : `ok=${ok}`}`);
};

export async function reportIssue(f: FormData) {
  const { data, error } = await (await createClient()).rpc("report_issue", { p: {
    type_id: s(f, "type_id"), title: s(f, "title"), source: s(f, "source"), location: s(f, "location"), kiosk_id: s(f, "kiosk_id"),
    severity: s(f, "severity"), owner_id: s(f, "owner_id"), amount: s(f, "amount"), notes: s(f, "notes"),
  } });
  if (error) redirect(`/issues/new?error=${encodeURIComponent(error.message)}`);
  redirect(`/issues/${data}?ok=created`);
}
export async function setIssueStatus(f: FormData) {
  const id = s(f, "id");
  const { error } = await (await createClient()).rpc("set_issue_status", { p_id: id, p_status: s(f, "status"), p_note: s(f, "note") });
  back(id, error, "status");
}
export async function reassignIssue(f: FormData) {
  const id = s(f, "id");
  const { error } = await (await createClient()).rpc("reassign_issue", { p_id: id, p_owner: s(f, "owner_id") });
  back(id, error, "saved");
}
export async function addIssueNote(f: FormData) {
  const id = s(f, "id");
  const { error } = await (await createClient()).rpc("add_issue_note", { p_id: id, p_text: s(f, "text") });
  back(id, error, "note");
}
export async function setIssueAmount(f: FormData) {
  const id = s(f, "id");
  const { error } = await (await createClient()).rpc("set_issue_amount", { p_id: id, p_amount: Number(s(f, "amount") || 0) });
  back(id, error, "saved");
}
export async function saveIssueType(f: FormData) {
  const { error } = await (await createClient()).rpc("save_issue_type", { p_id: s(f, "id") || null, p: {
    name: s(f, "name").replace(/\s*\n+\s*/g, " "), department_id: s(f, "department_id"), second_department_id: s(f, "second_department_id"), default_owner_id: s(f, "default_owner_id"),
    backup_id: s(f, "backup_id"), respond_minutes: Number(s(f, "respond_minutes")), fix_minutes: Number(s(f, "fix_minutes")),
    is_finance: f.get("is_finance") === "on", business: s(f, "business"), active: f.get("active") === "on" || !s(f, "id"),
  } });
  revalidatePath("/issues/types");
  redirect(`/issues/types?${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}
