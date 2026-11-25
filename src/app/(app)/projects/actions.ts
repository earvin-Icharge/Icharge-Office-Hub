"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const payload = (f: FormData) => ({
  name: s(f, "name"), business: s(f, "business"), owner_id: s(f, "owner_id"), status: s(f, "status"), priority: s(f, "priority"),
  description: s(f, "description"), start_date: s(f, "start_date"), due_date: s(f, "due_date"),
  members: f.getAll("members").map(String).filter(Boolean), departments: f.getAll("departments").map(String).filter(Boolean),
});

export async function saveProject(f: FormData) {
  const id = s(f, "id") || null;
  const { data, error } = await (await createClient()).rpc("save_project", { p_id: id, p: payload(f) });
  if (error) redirect(id ? `/projects/${id}?error=${encodeURIComponent(error.message)}` : `/projects/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/projects");
  redirect(`/projects/${data}?ok=${id ? "saved" : "created"}`);
}

export async function moveProject(f: FormData) {
  const { error } = await (await createClient()).rpc("set_project_status", { p_id: s(f, "id"), p_status: s(f, "status") });
  revalidatePath("/projects");
  redirect(`${s(f, "back") || "/projects"}${error ? `${s(f, "back").includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}` : ""}`);
}

export async function deleteProject(f: FormData) {
  const { error } = await (await createClient()).rpc("delete_project", { p_id: s(f, "id") });
  if (error) redirect(`/projects/${s(f, "id")}?error=${encodeURIComponent(error.message)}`);
  redirect("/projects?ok=deleted");
}

export async function addMilestone(f: FormData) {
  const id = s(f, "id");
  const { error } = await (await createClient()).rpc("save_milestone", { p_project: id, p_title: s(f, "title"), p_due: s(f, "due_date") });
  redirect(`/projects/${id}?${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}

export async function toggleMilestone(f: FormData) {
  const id = s(f, "id");
  await (await createClient()).rpc("set_milestone_done", { p_id: s(f, "milestone"), p_done: s(f, "done") === "1" });
  redirect(`/projects/${id}`);
}
