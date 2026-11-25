import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { TASK_LIST_SELECT, type TaskRow } from "@/lib/tasks";
import { manilaDayBounds, toManilaInput } from "@/lib/time";
import { getViewer } from "@/lib/viewer";
import { TaskList } from "../../tasks/TaskList";
import { addActionItem, deleteMeeting, sendNotes } from "../actions";
import { MeetingForm } from "../MeetingForm";

export const metadata = { title: "Meeting" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("meetings");
  const tt = await getTranslations("tasks");
  const tb = await getTranslations("business");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data: m } = await supabase.from("meetings").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!m) notFound();
  const [{ data: att }, { data: actions }, people] = await Promise.all([
    supabase.from("meeting_attendees").select("profile_id").eq("meeting_id", id),
    supabase.from("tasks").select(TASK_LIST_SELECT).eq("meeting_id", id).is("deleted_at", null).order("due_at"),
    getPeople(),
  ]);
  const attendees = [...new Set([m.created_by, ...(att ?? []).map((a) => a.profile_id)])];
  const name = (pid: string) => people.find((p) => p.id === pid)?.name ?? "—";
  const defaultDue = toManilaInput(new Date(new Date(manilaDayBounds(3).start).getTime() + 17 * 3600_000).toISOString());
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/meetings" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
        <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{m.title}</h1>
        <span className="text-sm text-muted">{format.dateTime(new Date(m.meeting_at), { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}{m.location ? ` · ${m.location}` : ""}</span>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
          {m.agenda && <section className={card}><h2 className="text-base font-bold">{t("f.agenda")}</h2><p className="whitespace-pre-wrap text-sm">{m.agenda}</p></section>}
          {m.notes && <section className={card}><h2 className="text-base font-bold">{t("f.notes")}</h2><p className="whitespace-pre-wrap text-sm">{m.notes}</p></section>}
          <section className="overflow-hidden rounded-[14px] border border-line bg-white">
            <div className="px-4 pt-4 pb-3"><h2 className="text-base font-bold">{t("actions")}</h2><p className="text-xs text-muted">{t("actionHelp")}</p></div>
            <TaskList tasks={(actions ?? []) as unknown as TaskRow[]} me={viewer.id} empty={<p className="border-t border-line px-4 py-3 text-sm text-muted">{t("noActions")}</p>} />
            <form action={addActionItem} className="flex flex-wrap items-end gap-2 border-t border-line p-4">
              <input type="hidden" name="meeting_id" value={id} />
              <label className="flex min-w-[200px] flex-[2_1_200px] flex-col gap-1 text-xs font-semibold">{tt("f.title")}<input name="title" required minLength={2} className={field} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">{tt("owner")}<select name="owner_id" className={field}>{attendees.map((a) => <option key={a} value={a}>{name(a)}</option>)}</select></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">{tt("f.due")}<input type="datetime-local" name="due_at" required defaultValue={defaultDue} className={field} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">{tt("f.business")}
                <select name="business" required defaultValue={viewer.defaultBusiness === "all" ? "company" : viewer.defaultBusiness} className={field}>
                  <option value="icharge">{tb("icharge")}</option><option value="iscreen">{tb("iscreen")}</option><option value="company">{tb("company")}</option></select></label>
              <button className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("addAction")}</button>
            </form>
          </section>
        </div>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          <section className={card}>
            <h2 className="text-base font-bold">{t("f.attendees")}</h2>
            <p className="text-sm">{attendees.map(name).join(", ")}</p>
            <form action={sendNotes}><input type="hidden" name="id" value={id} /><button className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("send")}</button></form>
            {m.notes_sent_at && <p className="text-xs text-muted">{t("sentAt", { date: format.dateTime(new Date(m.notes_sent_at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })}</p>}
          </section>
          <details className={card}>
            <summary className="cursor-pointer text-sm font-bold">{t("edit")}</summary>
            <MeetingForm me={viewer.id} meeting={{ ...m, attendees: (att ?? []).map((a) => a.profile_id) }} />
            <form action={deleteMeeting} className="border-t border-line pt-3"><input type="hidden" name="id" value={id} /><button className="h-10 rounded-[10px] border border-[#FCA5A5] bg-white px-4 text-sm font-semibold text-danger">{t("delete")}</button></form>
          </details>
        </aside>
      </div>
    </>
  );
}
