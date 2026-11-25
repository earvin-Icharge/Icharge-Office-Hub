import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { BusinessPill } from "@/components/BusinessPill";
import { FileUpload } from "@/components/FileUpload";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { TimerPill } from "@/components/TimerPill";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { TASK_LIST_SELECT, type TaskRow } from "@/lib/tasks";
import { getViewer } from "@/lib/viewer";
import { TaskList } from "../../tasks/TaskList";
import { openAttachment } from "../../tasks/actions";
import { addIssueNote, reassignIssue, setIssueAmount, setIssueStatus } from "../actions";

export const metadata = { title: "Issue" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";
const btn = "h-10 rounded-[10px] px-4 text-sm font-semibold";

export default async function IssuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("issues");
  const format = await getFormatter();
  const when = (d: string) => format.dateTime(new Date(d), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const supabase = await createClient();
  const { data: i } = await supabase.from("issues").select("*, type:issue_types(name)").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!i) notFound();
  const [{ data: events }, { data: amount }, { data: canAmount }, { data: canWork }, { data: tasks }, { data: files }, people] = await Promise.all([
    supabase.from("issue_events").select("id, kind, text, at, actor_id").eq("issue_id", id).order("at"),
    supabase.from("issue_amounts").select("amount").eq("issue_id", id).maybeSingle(),
    supabase.rpc("can_see_issue_amount", { p_issue: id }),
    supabase.rpc("can_work_issue", { p_issue: id }),
    supabase.from("tasks").select(TASK_LIST_SELECT).eq("issue_id", id).is("deleted_at", null),
    supabase.from("attachments").select("id, name").eq("entity", "issue").eq("entity_id", id).is("deleted_at", null),
    getPeople(),
  ]);
  const name = (pid: string | null) => people.find((p) => p.id === pid)?.name ?? "—";
  const open = !["resolved", "closed"].includes(i.status);
  const statusBtn = (status: string, text: string, primary = false) => (
    <form action={setIssueStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} />
      <button className={`${btn} ${primary ? "bg-charge font-bold text-forest" : "border border-field bg-white"}`}>{text}</button></form>
  );
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/issues" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
        <span className="text-[13px] text-muted">{t("ref", { ref: i.ref })} · {(i.type as { name: string } | null)?.name}</span>
        <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{i.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessPill business={i.business} />
          <Pill tone={i.status === "new" ? "new" : open ? "info" : "ok"}>{t(`status.${i.status}`)}</Pill>
          <Pill tone={i.severity === "critical" ? "bad" : i.severity === "high" ? "wait" : "plain"}>{t(`severity.${i.severity}`)}</Pill>
          {open && !i.acknowledged_at && <TimerPill label={t("respond")} start={i.reported_at} due={i.respond_due} />}
          <TimerPill label={t("fix")} start={i.reported_at} due={i.fix_due} stopped={i.resolved_at} />
        </div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
          {canWork && (
            <section className={card}>
              <div className="flex flex-wrap gap-2">
                {i.status === "new" && statusBtn("acknowledged", t("acknowledge"), true)}
                {open && i.status !== "in_progress" && statusBtn("in_progress", t("start"))}
                {i.status === "resolved" && statusBtn("closed", t("close"))}
                {!open && statusBtn("in_progress", t("reopen"))}
              </div>
              {open && (
                <form action={setIssueStatus} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="resolved" />
                  <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold">{t("resolveNote")}<input name="note" required className={field} /></label>
                  <button className={`${btn} bg-charge font-bold text-forest`}>{t("resolve")}</button>
                </form>
              )}
            </section>
          )}
          {i.notes && <section className={card}><p className="whitespace-pre-wrap text-sm">{i.notes}</p></section>}
          <section className="overflow-hidden rounded-[14px] border border-line bg-white">
            <div className="flex items-center justify-between px-4 pt-4 pb-3"><h2 className="text-base font-bold">{t("tasks")}</h2>
              <Link href={`/tasks/new?issue_id=${id}&business=${i.business}&title=${encodeURIComponent(`ISS-${i.ref}: ${i.title}`)}&return_to=/issues/${id}`} className="inline-flex h-9 items-center rounded-[10px] bg-charge px-3.5 text-[13px] font-semibold text-forest">{t("addTask")}</Link></div>
            <TaskList tasks={(tasks ?? []) as unknown as TaskRow[]} me={viewer.id} empty={<span />} />
          </section>
          <section className={card}>
            <h2 className="text-base font-bold">{t("notes")}</h2>
            <ul className="flex flex-col gap-2">
              {(events ?? []).map((e) => (
                <li key={e.id} className="text-sm"><span className="text-xs text-muted">{when(e.at)} · <b className="text-forest">{name(e.actor_id)}</b></span><br />
                  <span className={e.kind === "note" ? "" : "text-muted"}>{e.text}</span></li>
              ))}
            </ul>
            <form action={addIssueNote} className="flex gap-2"><input type="hidden" name="id" value={id} />
              <input name="text" required aria-label={t("addNote")} className={`${field} flex-1`} /><button className={`${btn} border border-field bg-white`}>{t("addNote")}</button></form>
          </section>
          <section className={card}>
            <h2 className="text-base font-bold">{t("files")}</h2>
            <ul>{(files ?? []).map((a) => <li key={a.id}><form action={openAttachment}><input type="hidden" name="attachment_id" value={a.id} /><button className="text-sm font-semibold text-leaf hover:underline">{a.name}</button></form></li>)}</ul>
            <FileUpload entity="issue" entityId={id} />
          </section>
        </div>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          <section className={card}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t("f.owner")}</dt><dd className="font-semibold">{name(i.owner_id)}</dd>
              <dt className="text-muted">{t("f.kiosk")}</dt><dd>{i.kiosk_id ?? "—"}</dd>
              <dt className="text-muted">{t("f.location")}</dt><dd>{i.location ?? "—"}</dd>
              <dt className="text-muted">{t("f.source")}</dt><dd>{t(`source.${i.source}`)}</dd>
            </dl>
            <p className="text-xs text-muted">{t("reportedBy", { name: name(i.reported_by), date: when(i.reported_at) })}</p>
            {canWork && (
              <form action={reassignIssue} className="flex gap-2"><input type="hidden" name="id" value={id} />
                <select name="owner_id" defaultValue={i.owner_id ?? ""} aria-label={t("reassign")} className={`${field} flex-1`}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <button className={`${btn} border border-field bg-white`}>{t("reassign")}</button></form>
            )}
          </section>
          {canAmount && (
            <section className={card}>
              <h2 className="text-base font-bold">{t("amount")}</h2>
              <form action={setIssueAmount} className="flex gap-2"><input type="hidden" name="id" value={id} />
                <input name="amount" type="number" min="0" step="0.01" defaultValue={amount?.amount ?? ""} aria-label={t("amount")} className={`${field} flex-1`} />
                <button className={`${btn} border border-field bg-white`}>{t("saveAmount")}</button></form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
