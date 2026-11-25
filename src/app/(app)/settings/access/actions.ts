"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Tab = "requests" | "invites" | "changes" | "people";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const b = (f: FormData, k: string) => f.get(k) === "on";
const level = (f: FormData) => (["leader", "manager", "staff"].includes(s(f, "level")) ? s(f, "level") : "staff");

function done(tab: Tab, error: { message: string } | null, ok: string): never {
  revalidatePath("/", "layout");
  const q = error ? `error=${encodeURIComponent(error.message)}` : `ok=${ok}`;
  redirect(`/settings/access?tab=${tab}&${q}`);
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  return error;
}

export async function proposeRequest(f: FormData) {
  const err = await rpc("propose_access_request", {
    p_request_id: s(f, "id"), p_level: level(f), p_hr: b(f, "hr"), p_finance: b(f, "finance"), p_department_id: s(f, "department_id") || null,
  });
  done("requests", err, "okProposed");
}

export async function approveRequest(f: FormData) {
  const err = await rpc("approve_access_request", {
    p_request_id: s(f, "id"), p_level: level(f), p_hr: b(f, "hr"), p_finance: b(f, "finance"), p_department_id: s(f, "department_id") || null,
  });
  done("requests", err, "okApproved");
}

export async function sendBackRequest(f: FormData) {
  done("requests", await rpc("send_back_access_request", { p_request_id: s(f, "id"), p_reason: s(f, "reason") }), "okSentBack");
}

export async function declineRequest(f: FormData) {
  done("requests", await rpc("decline_access_request", { p_request_id: s(f, "id"), p_reason: s(f, "reason") }), "okDeclined");
}

export async function createInvite(f: FormData) {
  const err = await rpc("create_invite", {
    p_email: s(f, "email"), p_full_name: s(f, "full_name"), p_position: s(f, "position"),
    p_department_id: s(f, "department_id") || null, p_supervisor_id: s(f, "supervisor_id") || null,
    p_level: level(f), p_hr: b(f, "hr"), p_finance: b(f, "finance"),
  });
  done("invites", err, "okInvite");
}

export async function decideInvite(f: FormData) {
  done("invites", await rpc("decide_invite", { p_invite_id: s(f, "id"), p_approve: s(f, "decision") === "approve", p_reason: s(f, "reason") }), "ok");
}

export async function proposeChange(f: FormData) {
  const err = await rpc("propose_access_change", {
    p_profile_id: s(f, "profile_id"), p_level: level(f), p_hr: b(f, "hr"), p_finance: b(f, "finance"), p_reason: s(f, "reason"),
  });
  done("people", err, "okChange");
}

export async function decideChange(f: FormData) {
  done("changes", await rpc("decide_access_change", { p_change_id: s(f, "id"), p_approve: s(f, "decision") === "approve", p_reason: s(f, "reason") }), "okChange");
}

/** Removing access is immediate: also blocks the sign-in account so no new code or session works. */
export async function deactivate(f: FormData) {
  const id = s(f, "profile_id");
  const err = await rpc("deactivate_profile", { p_profile_id: id, p_reason: s(f, "reason") });
  if (!err) await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "876000h" });
  done("people", err, "okDeactivated");
}

export async function reactivate(f: FormData) {
  const id = s(f, "profile_id");
  const err = await rpc("reactivate_profile", { p_profile_id: id, p_reason: s(f, "reason") });
  if (!err) await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "none" });
  done("people", err, "okReactivated");
}

/** Lost phone: HR or a Leader removes all devices of a person (spec 3.5). Their next visit needs an email code. */
export async function removeAllDevices(f: FormData) {
  const { getViewer } = await import("@/lib/viewer");
  const viewer = await getViewer();
  if (!viewer?.active || !(viewer.hr || viewer.level === "leader")) done("people", { message: "Only HR or a Leader can do this." }, "ok");
  const id = s(f, "profile_id");
  const db = createAdminClient();
  await db.from("user_devices")
    .update({ removed_at: new Date().toISOString(), passkey_credential_id: null, passkey_public_key: null, pin_hash: null, quick_method: null })
    .eq("profile_id", id).is("removed_at", null);
  await db.from("push_subscriptions").delete().eq("profile_id", id);
  await db.from("audit_log").insert({ actor_id: viewer!.id, action: "devices_removed_all", table_name: "user_devices", subject_profile_id: id, new: { by: viewer!.name } });
  done("people", null, "okDevicesRemoved");
}
