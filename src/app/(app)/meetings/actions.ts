"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromManilaInput } from "@/lib/time";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveMeeting(f: FormData) {
  const id = s(f, "id") || null;
  const { data, error } = await (await createClient()).rpc("save_meeting", { p_id: id, p: {
    title: s(f, "title"), meeting_at: fromManilaInput(s(f, "meeting_at")), location: s(f, "location"), agenda: s(f, "agenda"), notes: s(f, "notes"),
    attendees: f.getAll("attendees").map(String).filter(Boolean),
  } });
  if (error) redirect(`${id ? `/meetings/${id}` : "/meetings/new"}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/meetings");
  redirect(`/meetings/${data}?ok=${id ? "saved" : "created"}`);
}

export async function addActionItem(f: FormData) {
  const id = s(f, "meeting_id");
  const { error } = await (await createClient()).rpc("create_task", { p: {
    title: s(f, "title"), owner_id: s(f, "owner_id"), due_at: fromManilaInput(s(f, "due_at")), business: s(f, "business"), priority: s(f, "priority") || "normal", meeting_id: id,
  } });
  redirect(`/meetings/${id}?${error ? `error=${encodeURIComponent(error.message)}` : "ok=action"}`);
}

export async function sendNotes(f: FormData) {
  const id = s(f, "id");
  const { error } = await (await createClient()).rpc("send_meeting_notes", { p_id: id });
  redirect(`/meetings/${id}?${error ? `error=${encodeURIComponent(error.message)}` : "ok=sent"}`);
}

export async function deleteMeeting(f: FormData) {
  const { error } = await (await createClient()).rpc("delete_meeting", { p_id: s(f, "id") });
  if (error) redirect(`/meetings/${s(f, "id")}?error=${encodeURIComponent(error.message)}`);
  redirect("/meetings?ok=deleted");
}
