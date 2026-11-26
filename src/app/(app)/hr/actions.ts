"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string, error: { message: string } | null, ok: string, extra = ""): never => {
  revalidatePath(`/hr/employees/${id}`);
  redirect(`/hr/employees/${id}?${error ? `error=${encodeURIComponent(error.message)}` : `ok=${ok}`}${extra}`);
};
const rpc = async (fn: string, args: Record<string, unknown>) => (await createClient()).rpc(fn, args);

export async function saveEmployee(f: FormData) {
  const id = s(f, "id");
  const p = Object.fromEntries(["name", "employee_id", "position", "phone", "department_id", "supervisor_id", "backup_approver_id", "employment_status", "start_date",
    "regularization_date", "end_date", "work_setup", "shift_id"].map((k) => [k, s(f, k)]));
  back(id, (await rpc("save_employee", { p_profile: id, p })).error, "saved");
}
export async function savePrivate(f: FormData) {
  const id = s(f, "id");
  const p = Object.fromEntries(["address", "emergency_name", "emergency_phone", "emergency_relation", "sss", "philhealth", "pagibig", "tin", "wfh_address", "wfh_lat", "wfh_lng"].map((k) => [k, s(f, k)]));
  back(id, (await rpc("save_hr_private", { p_profile: id, p })).error, "saved", "&show=1");
}
export async function addHrNote(f: FormData) {
  const id = s(f, "id");
  back(id, (await rpc("add_hr_note", { p_profile: id, p_note: s(f, "note") })).error, "saved", "&show=1");
}
export async function decideWfh(f: FormData) {
  const id = s(f, "id");
  back(id, (await rpc("decide_wfh_change", { p_profile: id, p_approve: s(f, "decision") === "approve" })).error, "saved", "&show=1");
}
export async function startChecklist(f: FormData) {
  const id = s(f, "id");
  back(id, (await rpc("start_checklist", { p_profile: id, p_kind: s(f, "kind"), p_date: s(f, "date") })).error, "started");
}
export async function saveChecklistItem(f: FormData) {
  const { error } = await rpc("save_checklist_item", { p_id: s(f, "id") || null, p: { kind: s(f, "kind"), text: s(f, "text").replace(/\s*\n+\s*/g, " "), owner_role: s(f, "owner_role"), days_offset: s(f, "when_days") !== "" ? String((s(f, "when_dir") === "before" ? -1 : s(f, "when_dir") === "on" ? 0 : 1) * Math.abs(Number(s(f, "when_days")))) : s(f, "days_offset"), position: s(f, "position"), active: f.get("active") === "on" || !s(f, "id") } });
  revalidatePath("/hr/checklists");
  redirect(`/hr/checklists?${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}

// ---- documents: private bucket "hr-documents", Leader and HR only; opening one is logged

export async function startDocUpload(profileId: string, name: string, size: number) {
  if (size > 20 * 1024 * 1024) return { ok: false as const, error: "File too large (max 20 MB)." };
  const { data: allowed } = await rpc("can_edit_hr", { p_profile: profileId });
  if (!allowed) return { ok: false as const, error: "Not allowed." };
  const path = `${profileId}/${randomUUID()}-${name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  const { data, error } = await createAdminClient().storage.from("hr-documents").createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, error: error?.message ?? "Upload failed." };
  return { ok: true as const, path, token: data.token };
}
export async function finishDocUpload(profileId: string, path: string, name: string, size: number, kind: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: allowed } = await supabase.rpc("can_edit_hr", { p_profile: profileId });
  if (!user || !allowed || !path.startsWith(`${profileId}/`)) return { ok: false as const };
  await createAdminClient().from("employee_documents").insert({ profile_id: profileId, path, name: name.slice(0, 200), size_bytes: size, kind: kind || "other", uploaded_by: user.id });
  revalidatePath(`/hr/employees/${profileId}`);
  return { ok: true as const };
}
export async function openDocument(f: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: doc } = await supabase.from("employee_documents").select("path, profile_id, name").eq("id", s(f, "doc_id")).maybeSingle();
  if (!doc || !user) redirect("/hr/employees");
  const admin = createAdminClient();
  await admin.from("audit_log").insert({ actor_id: user.id, action: "view_sensitive", table_name: "employee_documents", record_id: s(f, "doc_id"), subject_profile_id: doc.profile_id, new: { viewed: doc.name } });
  const { data } = await admin.storage.from("hr-documents").createSignedUrl(doc.path, 60);
  redirect(data?.signedUrl ?? "/hr/employees");
}
