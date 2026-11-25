"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromManilaInput } from "@/lib/time";
import { getPeople } from "@/lib/people";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string, r: { error: { message: string } | null }, ok: string): never => {
  revalidatePath(`/tasks/${id}`);
  redirect(`/tasks/${id}?${r.error ? `error=${encodeURIComponent(r.error.message)}` : `ok=${ok}`}`);
};

export async function createTask(f: FormData) {
  const supabase = await createClient();
  const payload = {
    title: s(f, "title"), description: s(f, "description"), owner_id: s(f, "owner_id"), project_id: s(f, "project_id"),
    business: s(f, "business"), due_at: fromManilaInput(s(f, "due_at")), priority: s(f, "priority") || "normal",
    needs_approval: f.get("needs_approval") === "on", follow_up_at: fromManilaInput(s(f, "follow_up_at")),
    recurrence_rule: s(f, "recurrence_rule"), watchers: f.getAll("watchers").map(String).filter(Boolean),
    checklist: s(f, "checklist").split("\n").map((x) => x.trim()).filter(Boolean),
    meeting_id: s(f, "meeting_id"), issue_id: s(f, "issue_id"),
  };
  const { data, error } = await supabase.rpc("create_task", { p: payload });
  if (error) {
    const q = new URLSearchParams({ error: error.message, ...Object.fromEntries([...f.entries()].filter(([k, v]) => typeof v === "string" && k !== "watchers" && !k.startsWith("$")).map(([k, v]) => [k, String(v)])) });
    redirect(`/tasks/new?${q.toString()}`);
  }
  const next = s(f, "return_to");
  redirect(next.startsWith("/") ? `${next}${next.includes("?") ? "&" : "?"}ok=created` : `/tasks/${data}?ok=created`);
}

export async function updateTask(f: FormData) {
  const id = s(f, "id");
  const supabase = await createClient();
  const r = await supabase.rpc("update_task", { p_id: id, p: {
    title: s(f, "title"), description: s(f, "description"), owner_id: s(f, "owner_id"), due_at: fromManilaInput(s(f, "due_at")),
    priority: s(f, "priority"), needs_approval: f.get("needs_approval") === "on", follow_up_at: fromManilaInput(s(f, "follow_up_at")),
    recurrence_rule: s(f, "recurrence_rule"),
  } });
  back(id, r, "saved");
}

export async function acknowledgeTask(f: FormData) {
  const id = s(f, "id");
  back(id, await (await createClient()).rpc("acknowledge_task", { p_id: id }), "ack");
}

export async function setTaskStatus(f: FormData) {
  const id = s(f, "id");
  back(id, await (await createClient()).rpc("set_task_status", { p_id: id, p_status: s(f, "status"), p_note: s(f, "note"), p_waiting_on: s(f, "waiting_on") }), "status");
}

export async function reviewTask(f: FormData) {
  const id = s(f, "id");
  back(id, await (await createClient()).rpc("review_task", { p_id: id, p_accept: s(f, "decision") === "accept", p_reason: s(f, "reason") }), "reviewed");
}

export async function decideTaskRequest(f: FormData) {
  const id = s(f, "id");
  back(id, await (await createClient()).rpc("decide_task_request", { p_id: id, p_accept: s(f, "decision") === "accept", p_reason: s(f, "reason") }), "reviewed");
}

/** @mentions: "@Full Name" or a unique "@FirstName". */
export async function addComment(f: FormData) {
  const id = s(f, "id");
  const body = s(f, "body");
  const lower = body.toLowerCase();
  const people = await getPeople();
  const firstCount = new Map<string, number>();
  for (const p of people) { const fn = p.name.split(" ")[0].toLowerCase(); firstCount.set(fn, (firstCount.get(fn) ?? 0) + 1); }
  const mentions = people.filter((p) => {
    const full = `@${p.name.toLowerCase()}`, first = p.name.split(" ")[0].toLowerCase();
    return lower.includes(full) || (firstCount.get(first) === 1 && new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));
  }).map((p) => p.id);
  back(id, await (await createClient()).rpc("add_task_comment", { p_id: id, p_body: body, p_mentions: mentions }), "comment");
}

export async function toggleChecklist(f: FormData) {
  const id = s(f, "id");
  back(id, await (await createClient()).rpc("set_checklist_item", { p_item: s(f, "item"), p_done: s(f, "done") === "1" }), "saved");
}

export async function addChecklistItem(f: FormData) {
  const id = s(f, "id");
  back(id, await (await createClient()).rpc("add_checklist_item", { p_task: id, p_text: s(f, "text") }), "saved");
}

export async function deleteTask(f: FormData) {
  const id = s(f, "id");
  const r = await (await createClient()).rpc("delete_task", { p_id: id });
  if (r.error) back(id, r, "");
  redirect("/tasks?ok=deleted");
}

// ------------------------------------------------------------------ files (private bucket, signed links)

const CAN_SEE: Record<string, string> = { task: "can_see_task", project: "can_see_project" };

/** Step 1 of an upload: check access, then hand back a one-time upload link. */
export async function startUpload(entity: string, entityId: string, name: string, size: number) {
  const fn = CAN_SEE[entity];
  if (!fn || size > 20 * 1024 * 1024) return { ok: false as const, error: "File too large (max 20 MB)." };
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc(fn, entity === "task" ? { p_task: entityId } : { p_project: entityId });
  if (!allowed) return { ok: false as const, error: "Not allowed." };
  const path = `${entity}/${entityId}/${randomUUID()}-${name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  const { data, error } = await createAdminClient().storage.from("attachments").createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, error: error?.message ?? "Upload failed." };
  return { ok: true as const, path, token: data.token };
}

/** Step 2: record the uploaded file. */
export async function finishUpload(entity: string, entityId: string, path: string, name: string, size: number, mime: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const fn = CAN_SEE[entity];
  const { data: allowed } = await supabase.rpc(fn, entity === "task" ? { p_task: entityId } : { p_project: entityId });
  if (!user || !allowed || !path.startsWith(`${entity}/${entityId}/`)) return { ok: false as const };
  await createAdminClient().from("attachments").insert({ entity, entity_id: entityId, path, name: name.slice(0, 200), size_bytes: size, mime, uploaded_by: user.id });
  revalidatePath(`/${entity === "task" ? "tasks" : "projects"}/${entityId}`);
  return { ok: true as const };
}

/** Opens a file through a short-lived signed link (60 s). */
export async function openAttachment(f: FormData) {
  const supabase = await createClient();
  const { data: att } = await supabase.from("attachments").select("path").eq("id", s(f, "attachment_id")).maybeSingle();
  if (!att) redirect("/tasks");
  const { data } = await createAdminClient().storage.from("attachments").createSignedUrl(att.path, 60);
  redirect(data?.signedUrl ?? "/tasks");
}
