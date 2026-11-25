import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Battery } from "@/components/Battery";
import { BusinessPill } from "@/components/BusinessPill";
import { FileUpload } from "@/components/FileUpload";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { TASK_LIST_SELECT, type TaskRow } from "@/lib/tasks";
import { getViewer } from "@/lib/viewer";
import { TaskList } from "../../tasks/TaskList";
import { openAttachment } from "../../tasks/actions";
import { addMilestone, deleteProject, moveProject, toggleMilestone } from "../actions";
import { ProjectForm } from "../ProjectForm";

export const metadata = { title: "Project" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("projects");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!p) notFound();
  const [{ data: members }, { data: depts }, { data: miles }, { data: tasks }, { data: files }, { data: prog }, { data: canEdit }, people] = await Promise.all([
    supabase.from("project_members").select("profile_id").eq("project_id", id),
    supabase.from("project_departments").select("department_id").eq("project_id", id),
    supabase.from("milestones").select("id, title, due_date, done_at").eq("project_id", id).order("due_date"),
    supabase.from("tasks").select(TASK_LIST_SELECT).eq("project_id", id).is("deleted_at", null).order("due_at"),
    supabase.from("attachments").select("id, name, size_bytes").eq("entity", "project").eq("entity_id", id).is("deleted_at", null),
    supabase.rpc("project_progress", { p_project: id }),
    supabase.rpc("can_edit_project", { p_project: id }),
    getPeople(),
  ]);
  const pr = ((Array.isArray(prog) ? prog[0] : prog) ?? { done: 0, total: 0 }) as { done: number; total: number };
  const name = (pid: string) => people.find((x) => x.id === pid)?.name ?? "—";
  const d = (x: string) => format.dateTime(new Date(x), { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/projects" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
        <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{p.name}</h1>
        <div className="flex flex-wrap items-center gap-2"><BusinessPill business={p.business} /><Pill tone={p.status === "done" ? "ok" : p.status === "on_hold" ? "wait" : "info"}>{t(`status.${p.status}`)}</Pill></div>
      </div>
      <Flash ok={sp.ok ? (t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null) : null} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
          <section className={card}>
            <Battery percent={pr.total ? (pr.done / pr.total) * 100 : 0} label={t("progress", pr)} />
            <span className="text-sm text-muted">{t("progress", pr)}</span>
            {p.description && <p className="whitespace-pre-wrap text-sm">{p.description}</p>}
          </section>
          <section className="overflow-hidden rounded-[14px] border border-line bg-white">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h2 className="text-base font-bold">{t("tasks")}</h2>
              <Link href={`/tasks/new?project_id=${id}&return_to=/projects/${id}`} className="inline-flex h-9 items-center rounded-[10px] bg-charge px-3.5 text-[13px] font-semibold text-forest">{t("addTask")}</Link>
            </div>
            <TaskList tasks={(tasks ?? []) as unknown as TaskRow[]} me={viewer.id} empty={<div className="flex items-center gap-3 border-t border-line px-4 py-4"><Image src="/mascot/thumbs-up.png" alt="" width={48} height={48} className="h-12 w-12 object-contain" /><span className="text-sm text-muted">{t("noTasks")}</span></div>} />
          </section>
          <section className={card}>
            <h2 className="text-base font-bold">{t("milestones")}</h2>
            {(miles ?? []).length === 0 && <p className="text-sm text-muted">{t("noMilestones")}</p>}
            <ul className="flex flex-col gap-1.5">
              {(miles ?? []).map((m) => (
                <li key={m.id}>
                  <form action={toggleMilestone} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={id} /><input type="hidden" name="milestone" value={m.id} /><input type="hidden" name="done" value={m.done_at ? "0" : "1"} />
                    <button aria-pressed={!!m.done_at} className={`flex h-6 w-6 items-center justify-center rounded-md border ${m.done_at ? "border-leaf bg-charge" : "border-field bg-white"}`}>{m.done_at ? "✓" : ""}</button>
                    <span className={`text-sm ${m.done_at ? "text-muted line-through" : ""}`}>{m.title}</span>
                    <span className="text-xs text-muted">· {d(m.due_date)}</span>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addMilestone} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-semibold">{t("milestoneTitle")}<input name="title" required minLength={2} className={field} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.due")}<input type="date" name="due_date" required className={field} /></label>
              <button className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("addMilestone")}</button>
            </form>
          </section>
          <section className={card}>
            <h2 className="text-base font-bold">{t("files")}</h2>
            <ul className="flex flex-col gap-1">
              {(files ?? []).map((a) => (
                <li key={a.id}><form action={openAttachment}><input type="hidden" name="attachment_id" value={a.id} /><button className="text-sm font-semibold text-leaf hover:underline">{a.name}</button></form></li>
              ))}
            </ul>
            <FileUpload entity="project" entityId={id} />
          </section>
        </div>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          <section className={card}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t("owner")}</dt><dd className="font-semibold">{name(p.owner_id)}</dd>
              <dt className="text-muted">{t("dates")}</dt><dd>{p.start_date ? d(p.start_date) : "—"} → {p.due_date ? d(p.due_date) : "—"}</dd>
              <dt className="text-muted">{t("members")}</dt><dd>{(members ?? []).map((m) => name(m.profile_id)).join(", ") || "—"}</dd>
            </dl>
            {canEdit && (
              <form action={moveProject} className="flex items-center gap-2">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={`/projects/${id}`} />
                <select name="status" defaultValue={p.status} aria-label={t("f.status")} className={field}>{["planning", "active", "on_hold", "done"].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
                <button className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("moveTo")}</button>
              </form>
            )}
          </section>
          {canEdit && (
            <details className={card}>
              <summary className="cursor-pointer text-sm font-bold">{t("edit")}</summary>
              <ProjectForm me={viewer.id} project={{ ...p, members: (members ?? []).map((m) => m.profile_id), departments: (depts ?? []).map((x) => x.department_id) }} />
              <form action={deleteProject} className="border-t border-line pt-3"><input type="hidden" name="id" value={id} /><button className="h-10 rounded-[10px] border border-[#FCA5A5] bg-white px-4 text-sm font-semibold text-danger">{t("delete")}</button></form>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
