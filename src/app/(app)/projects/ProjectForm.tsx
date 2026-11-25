import { getTranslations } from "next-intl/server";
import { getDepartments, getPeople } from "@/lib/people";
import { saveProject } from "./actions";

const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

type P = { id?: string; name?: string; business?: string; owner_id?: string; status?: string; priority?: string; description?: string | null;
  start_date?: string | null; due_date?: string | null; members?: string[]; departments?: string[] };

export async function ProjectForm({ project, me }: { project?: P; me: string }) {
  const t = await getTranslations("projects");
  const tb = await getTranslations("business");
  const tt = await getTranslations("tasks");
  const [people, depts] = await Promise.all([getPeople(), getDepartments()]);
  const p = project ?? {};
  return (
    <form action={saveProject} className="flex flex-col gap-3.5">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <label className={label}>{t("f.name")}<input name="name" required minLength={2} maxLength={160} defaultValue={p.name ?? ""} className={field} /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>{t("f.business")}
          <select name="business" required defaultValue={p.business ?? ""} className={field}>
            <option value="" disabled>{tt("f.choose")}</option>
            <option value="icharge">{tb("icharge")}</option><option value="iscreen">{tb("iscreen")}</option><option value="company">{tb("company")}</option>
          </select></label>
        <label className={label}>{t("f.owner")}
          <select name="owner_id" defaultValue={p.owner_id ?? me} className={field}>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className={label}>{t("f.status")}
          <select name="status" defaultValue={p.status ?? "planning"} className={field}>{["planning", "active", "on_hold", "done"].map((x) => <option key={x} value={x}>{t(`status.${x}`)}</option>)}</select></label>
        <label className={label}>{t("f.priority")}
          <select name="priority" defaultValue={p.priority ?? "normal"} className={field}>{["low", "normal", "high", "urgent"].map((x) => <option key={x} value={x}>{tt(`priority.${x}`)}</option>)}</select></label>
        <label className={label}>{t("f.start")}<input type="date" name="start_date" defaultValue={p.start_date ?? ""} className={field} /></label>
        <label className={label}>{t("f.due")}<input type="date" name="due_date" defaultValue={p.due_date ?? ""} className={field} /></label>
        <label className={label}>{t("f.members")}
          <select name="members" multiple defaultValue={p.members ?? []} className="h-28 rounded-[10px] border border-field bg-white px-2 py-1 text-sm">{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <span className="text-xs font-normal text-muted">{t("f.multiHelp")}</span></label>
        <label className={label}>{t("f.departments")}
          <select name="departments" multiple defaultValue={p.departments ?? []} className="h-28 rounded-[10px] border border-field bg-white px-2 py-1 text-sm">{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <label className={label}>{t("f.description")}<textarea name="description" rows={3} defaultValue={p.description ?? ""} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
      <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{p.id ? t("save") : t("create")}</button>
    </form>
  );
}
