import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { BusinessPill } from "@/components/BusinessPill";
import { FileUpload } from "@/components/FileUpload";
import { Flash } from "@/components/Flash";
import { Pill, PriorityLabel, TaskStatusPill } from "@/components/Pills";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { isOverdue } from "@/lib/tasks";
import { toManilaInput } from "@/lib/time";
import { getViewer } from "@/lib/viewer";
import {
  acknowledgeTask, addChecklistItem, addComment, decideTaskRequest, deleteTask, openAttachment, reviewTask, setTaskStatus, toggleChecklist, updateTask,
} from "../actions";

export const metadata = { title: "Task" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const btn = "h-10 rounded-[10px] px-4 text-sm font-semibold";
const primary = `${btn} bg-charge font-bold text-forest`;
const plain = `${btn} border border-field bg-white`;
const danger = `${btn} border border-[#FCA5A5] bg-white text-danger`;
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";

type Task = {
  id: string; ref: number; title: string; description: string | null; status: string; priority: string; due_at: string; business: "icharge" | "iscreen" | "company";
  owner_id: string; assigned_by: string; project_id: string | null; waiting_on: string | null; needs_approval: boolean; approval_state: string; assign_state: string;
  acknowledged_at: string | null; completion_note: string | null; follow_up_at: string | null; recurrence_rule: string | null; created_at: string;
  owner: { name: string } | null; assigner: { name: string } | null; project: { id: string; name: string } | null;
};

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("tasks");
  const format = await getFormatter();
  const when = (d: string) => format.dateTime(new Date(d), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const supabase = await createClient();

  const { data: task } = await supabase.from("tasks")
    .select("*, owner:profiles!tasks_owner_id_fkey(name), assigner:profiles!tasks_assigned_by_fkey(name), project:projects!tasks_project_id_fkey(id, name)")
    .eq("id", id).is("deleted_at", null).maybeSingle<Task>();
  if (!task) notFound();

  const [{ data: checklist }, { data: comments }, { data: history }, { data: files }, { data: watchers }, people] = await Promise.all([
    supabase.from("task_checklist").select("id, text, done").eq("task_id", id).order("position"),
    supabase.from("task_comments").select("id, body, created_at, author:profiles!task_comments_author_id_fkey(name)").eq("task_id", id).order("created_at"),
    supabase.from("task_history").select("id, field, old_value, new_value, at, actor_id").eq("task_id", id).order("at", { ascending: false }).limit(50),
    supabase.from("attachments").select("id, name, size_bytes, created_at").eq("entity", "task").eq("entity_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("task_watchers").select("profile_id").eq("task_id", id),
    getPeople(),
  ]);
  const name = (pid: string | null) => people.find((p) => p.id === pid)?.name ?? "—";
  const isOwner = task.owner_id === viewer.id;
  const isAssigner = task.assigned_by === viewer.id;
  const isLeader = viewer.level === "leader";
  const canEdit = isAssigner || isLeader;
  const canWork = (isOwner || canEdit) && task.assign_state === "accepted" && !["done", "cancelled"].includes(task.status);
  const historyValue = (field: string, v: string | null) =>
    !v ? "—" : field === "owner_id" ? name(v) : field === "status" ? (t.has(`status.${v}`) ? t(`status.${v}`) : v) : field === "priority" ? t(`priority.${v}`)
      : field.endsWith("_at") ? when(v) : v.length > 60 ? `${v.slice(0, 60)}…` : v;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/tasks" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
        <span className="text-[13px] text-muted">{t("ref", { ref: task.ref })}</span>
        <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{task.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessPill business={task.business} />
          {task.assign_state === "requested" ? <Pill tone="wait">{t("requested")}</Pill>
            : <TaskStatusPill status={task.status} overdue={isOverdue(task)} unacknowledged={!task.acknowledged_at} />}
          {task.approval_state === "accepted" && <Pill tone="ok">{t("accepted")}</Pill>}
          <PriorityLabel priority={task.priority} />
        </div>
      </div>
      <Flash ok={sp.ok ? (t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null) : null} error={sp.error} />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
          {task.assign_state === "requested" && (
            <section className={`${card} border-[#FCD34D] bg-[#FFFBEB]`}>
              <h2 className="text-base font-bold">{t("requestTitle")}</h2>
              <p className="text-sm">{t("requestBody", { name: task.assigner?.name ?? "—" })}</p>
              {viewer.level !== "staff" && !isAssigner && (
                <form action={decideTaskRequest} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={task.id} />
                  <button name="decision" value="accept" className={primary}>{t("acceptRequest")}</button>
                  <button name="decision" value="decline" className={danger}>{t("declineRequest")}</button>
                </form>
              )}
            </section>
          )}

          {(canWork || (isOwner && !task.acknowledged_at && task.assign_state === "accepted")) && (
            <section className={card} aria-label={t("changeStatus")}>
              <div className="flex flex-wrap items-center gap-2">
                {isOwner && !task.acknowledged_at && (
                  <form action={acknowledgeTask}><input type="hidden" name="id" value={task.id} /><button className={primary}>{t("acknowledge")}</button></form>
                )}
                {canWork && task.status !== "in_progress" && (
                  <form action={setTaskStatus}><input type="hidden" name="id" value={task.id} /><input type="hidden" name="status" value="in_progress" /><button className={plain}>{t("start")}</button></form>
                )}
              </div>
              {canWork && (
                <div className="flex flex-wrap items-start gap-2">
                  <details>
                    <summary className={`${plain} inline-flex cursor-pointer list-none items-center`}>{t("markWaiting")}</summary>
                    <form action={setTaskStatus} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={task.id} /><input type="hidden" name="status" value="waiting" />
                      <label className="flex flex-col gap-1 text-xs font-semibold">{t("waitingOn")}<input name="waiting_on" required className={field} /></label>
                      <button className={plain}>{t("status.waiting")}</button>
                    </form>
                  </details>
                  <details>
                    <summary className={`${primary} inline-flex cursor-pointer list-none items-center`}>{t("markDone")}</summary>
                    <form action={setTaskStatus} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="id" value={task.id} /><input type="hidden" name="status" value="done" />
                      <label className="flex flex-col gap-1 text-xs font-semibold">{t("completionNote")}<textarea name="note" required rows={2} className="rounded-[10px] border border-field px-3 py-2 text-sm" /></label>
                      <button className={`${primary} w-fit`}>{t("markDone")}</button>
                    </form>
                  </details>
                </div>
              )}
            </section>
          )}

          {task.status === "done" && task.approval_state === "pending" && (
            <section className={`${card} border-[#FCD34D] bg-[#FFFBEB]`}>
              <p className="text-sm font-semibold">{t("reviewPending", { name: task.assigner?.name ?? "—" })}</p>
              {canEdit && (
                <form action={reviewTask} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={task.id} />
                  <button name="decision" value="accept" className={primary}>{t("accept")}</button>
                  <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold">{t("reopenReason")}<input name="reason" className={field} /></label>
                  <button name="decision" value="reopen" className={danger}>{t("reopen")}</button>
                </form>
              )}
            </section>
          )}

          {(task.description || task.completion_note) && (
            <section className={card}>
              {task.description && <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>}
              {task.completion_note && <p className="text-sm"><b>{t("completion")}:</b> {task.completion_note}</p>}
            </section>
          )}

          <section className={card} aria-label={t("checklistTitle")}>
            <h2 className="text-base font-bold">{t("checklistTitle")}</h2>
            <ul className="flex flex-col gap-1.5">
              {(checklist ?? []).map((c) => (
                <li key={c.id}>
                  <form action={toggleChecklist} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={task.id} /><input type="hidden" name="item" value={c.id} /><input type="hidden" name="done" value={c.done ? "0" : "1"} />
                    <button aria-pressed={c.done} className={`flex h-6 w-6 items-center justify-center rounded-md border ${c.done ? "border-leaf bg-charge text-forest" : "border-field bg-white"}`}>{c.done ? "✓" : ""}</button>
                    <span className={`text-sm ${c.done ? "text-muted line-through" : ""}`}>{c.text}</span>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addChecklistItem} className="flex gap-2">
              <input type="hidden" name="id" value={task.id} />
              <input name="text" required aria-label={t("addItem")} placeholder={t("addItem")} className={`${field} flex-1`} />
              <button className={plain}>{t("addItem")}</button>
            </form>
          </section>

          <section className={card} aria-label={t("attachments")}>
            <h2 className="text-base font-bold">{t("attachments")}</h2>
            {(files ?? []).length === 0 ? <p className="text-sm text-muted">{t("noFiles")}</p> : (
              <ul className="flex flex-col gap-1">
                {(files ?? []).map((a) => (
                  <li key={a.id}>
                    <form action={openAttachment}><input type="hidden" name="attachment_id" value={a.id} />
                      <button className="text-left text-sm font-semibold text-leaf hover:underline">{a.name}</button>
                      <span className="ml-2 text-xs text-muted">{Math.max(1, Math.round(a.size_bytes / 1024))} KB</span>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <FileUpload entity="task" entityId={task.id} />
          </section>

          <section className={card} aria-label={t("comments")}>
            <h2 className="text-base font-bold">{t("comments")}</h2>
            {(comments ?? []).length === 0 && <p className="text-sm text-muted">{t("noComments")}</p>}
            <ul className="flex flex-col gap-3">
              {(comments ?? []).map((c) => (
                <li key={c.id} className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted"><b className="text-forest">{(c.author as unknown as { name: string } | null)?.name ?? "—"}</b> · {when(c.created_at)}</span>
                  <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
            <form action={addComment} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={task.id} />
              <textarea name="body" required rows={2} placeholder={t("commentPlaceholder")} aria-label={t("addComment")} className="rounded-[10px] border border-field px-3 py-2 text-sm" />
              <button className={`${plain} w-fit`}>{t("addComment")}</button>
            </form>
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          <section className={card}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t("owner")}</dt><dd className="font-semibold">{task.owner?.name}</dd>
              <dt className="text-muted">{t("assignedBy")}</dt><dd>{task.assigner?.name}</dd>
              <dt className="text-muted">{t("due")}</dt><dd className={isOverdue(task) ? "font-semibold text-danger" : ""}>{when(task.due_at)}</dd>
              <dt className="text-muted">{t("project")}</dt><dd>{task.project ? <Link className="text-leaf" href={`/projects/${task.project.id}`}>{task.project.name}</Link> : "—"}</dd>
              <dt className="text-muted">{t("watchers")}</dt><dd>{(watchers ?? []).map((w) => name(w.profile_id)).join(", ") || "—"}</dd>
            </dl>
            <p className="text-xs text-muted">{task.acknowledged_at ? t("acknowledged", { date: when(task.acknowledged_at) }) : t("notAcknowledged")}</p>
            {task.status === "waiting" && task.waiting_on && <p className="text-sm text-[#92400E]">{t("waitingLabel", { what: task.waiting_on })}</p>}
            {task.follow_up_at && <p className="text-xs text-muted">{t("followUp", { date: when(task.follow_up_at) })}</p>}
            {task.recurrence_rule && <p className="text-xs text-muted">{t("repeats", { rule: t(`f.${task.recurrence_rule}`) })}</p>}
          </section>

          {canEdit && (
            <details className={card}>
              <summary className="cursor-pointer text-sm font-bold">{t("edit")}</summary>
              <form action={updateTask} className="flex flex-col gap-2.5">
                <input type="hidden" name="id" value={task.id} />
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.title")}<input name="title" defaultValue={task.title} className={field} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.description")}<textarea name="description" defaultValue={task.description ?? ""} rows={3} className="rounded-[10px] border border-field px-3 py-2 text-sm" /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("reassign")}
                  <select name="owner_id" defaultValue={task.owner_id} className={field}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.due")}<input type="datetime-local" name="due_at" defaultValue={toManilaInput(task.due_at)} className={field} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.priority")}
                  <select name="priority" defaultValue={task.priority} className={field}>{["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.followUp")}<input type="datetime-local" name="follow_up_at" defaultValue={toManilaInput(task.follow_up_at)} className={field} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.recurrence")}
                  <select name="recurrence_rule" defaultValue={task.recurrence_rule ?? ""} className={field}>
                    <option value="">{t("f.recurNone")}</option><option value="daily">{t("f.daily")}</option><option value="weekly">{t("f.weekly")}</option><option value="monthly">{t("f.monthly")}</option>
                  </select></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="needs_approval" defaultChecked={task.needs_approval} className="h-4 w-4 accent-[#2F6B0A]" />{t("f.needsApproval")}</label>
                <button className={`${primary} w-fit`}>{t("save")}</button>
              </form>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {!["done", "cancelled"].includes(task.status) && (
                  <form action={setTaskStatus}><input type="hidden" name="id" value={task.id} /><input type="hidden" name="status" value="cancelled" /><button className={danger}>{t("cancelTask")}</button></form>
                )}
                <form action={deleteTask}><input type="hidden" name="id" value={task.id} /><button className={danger}>{t("delete")}</button></form>
              </div>
            </details>
          )}

          <section className={card} aria-label={t("history")}>
            <h2 className="text-base font-bold">{t("history")}</h2>
            <ul className="flex flex-col gap-1.5 text-xs">
              {(history ?? []).map((h) => (
                <li key={h.id}>
                  <b>{name(h.actor_id)}</b>{" "}
                  {h.field === "created" ? t("h.created") : <>{t.has(`h.${h.field}`) ? t(`h.${h.field}`) : h.field}: {historyValue(h.field, h.old_value)} → {historyValue(h.field, h.new_value)}</>}
                  <span className="text-muted"> · {when(h.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
