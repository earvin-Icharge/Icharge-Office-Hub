import Link from "next/link";
import { PickMany } from "@/components/PickMany";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { manilaDayBounds, toManilaInput } from "@/lib/time";
import { createTask } from "../actions";

export const metadata = { title: "New task" };
const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("tasks");
  const tb = await getTranslations("business");
  const sp = await searchParams;
  const supabase = await createClient();
  const people = await getPeople();
  const { data: projects } = await supabase.from("projects").select("id, name, business").is("deleted_at", null).neq("status", "done").order("name");
  const defaultDue = sp.due_at ?? toManilaInput(new Date(new Date(manilaDayBounds(1).start).getTime() + 17 * 3600_000).toISOString());

  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("newTask").replace("+ ", "")}</h1>
      <Flash error={sp.error} />
      <form action={createTask} className="flex max-w-[720px] flex-col gap-3.5 rounded-[14px] border border-line bg-white p-5">
        {sp.meeting_id && <input type="hidden" name="meeting_id" value={sp.meeting_id} />}
        {sp.issue_id && <input type="hidden" name="issue_id" value={sp.issue_id} />}
        {sp.return_to && <input type="hidden" name="return_to" value={sp.return_to} />}
        <label className={label}>{t("f.title")}<input name="title" required minLength={2} maxLength={200} defaultValue={sp.title ?? ""} className={field} /></label>
        <label className={label}>{t("f.description")}<textarea name="description" rows={3} defaultValue={sp.description ?? ""} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={label}>{t("f.owner")}
            <select name="owner_id" required defaultValue={sp.owner_id ?? viewer.id} className={field}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className={label}>{t("f.due")}<input type="datetime-local" name="due_at" required defaultValue={defaultDue} className={field} /></label>
          <label className={label}>{t("f.project")}
            <select name="project_id" defaultValue={sp.project_id ?? ""} className={field}>
              <option value="">{t("f.noProject")}</option>
              {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className={label}>{t("f.business")}
            <select name="business" defaultValue={sp.business ?? (viewer.defaultBusiness === "all" ? "" : viewer.defaultBusiness)} className={field}>
              <option value="">{t("f.choose")}</option>
              <option value="icharge">{tb("icharge")}</option>
              <option value="iscreen">{tb("iscreen")}</option>
              <option value="company">{tb("company")}</option>
            </select>
          </label>
          <label className={label}>{t("f.priority")}
            <select name="priority" defaultValue={sp.priority ?? "normal"} className={field}>
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
          </label>
          <label className={label}>{t("f.recurrence")}
            <select name="recurrence_rule" defaultValue={sp.recurrence_rule ?? ""} className={field}>
              <option value="">{t("f.recurNone")}</option>
              <option value="daily">{t("f.daily")}</option>
              <option value="weekly">{t("f.weekly")}</option>
              <option value="monthly">{t("f.monthly")}</option>
            </select>
          </label>
          <label className={label}>{t("f.followUp")}<input type="datetime-local" name="follow_up_at" defaultValue={sp.follow_up_at ?? ""} className={field} /></label>
          <PickMany label={t("f.watchers")} name="watchers" options={people.filter((p) => p.id !== viewer.id).map((p) => ({ value: p.id, label: p.name }))} help={t("f.watchersHelp")} />
        </div>
        <label className={label}>{t("f.checklist")}
          <textarea name="checklist" rows={3} defaultValue={sp.checklist ?? ""} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" />
          <span className="text-xs font-normal text-muted">{t("f.checklistHelp")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="needs_approval" defaultChecked={sp.needs_approval === "on"} className="h-4 w-4 accent-[#2F6B0A]" />{t("f.needsApproval")}</label>
        <div className="flex gap-2">
          <button type="submit" className="h-11 rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("create")}</button>
          <Link href="/tasks" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-5 text-sm font-semibold">{t("cancel")}</Link>
        </div>
      </form>
    </>
  );
}
