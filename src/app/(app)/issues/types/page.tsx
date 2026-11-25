import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { saveIssueType } from "../actions";

export const metadata = { title: "Issue types" };
const field = "h-10 rounded-[10px] border border-field bg-white px-2.5 text-sm min-w-0";
const label = "flex flex-col gap-1 text-xs font-semibold";
type IT = { id?: string; name?: string; department_id?: string | null; second_department_id?: string | null; default_owner_id?: string | null; backup_id?: string | null;
  respond_minutes?: number; fix_minutes?: number; is_finance?: boolean; business?: string; active?: boolean };

/** Issue types and targets: edited by the Leader (spec 4.7, 11). */
export default async function IssueTypesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (viewer?.level !== "leader") notFound();
  const t = await getTranslations("issues");
  const tb = await getTranslations("business");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: types }, depts, people] = await Promise.all([supabase.from("issue_types").select("*").order("name"), getDepartments(), getPeople()]);
  const form = (x: IT) => (
    <form key={x.id ?? "new"} action={saveIssueType} className="grid grid-cols-1 gap-2.5 rounded-[14px] border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      {x.id && <input type="hidden" name="id" value={x.id} />}
      <label className={`${label} sm:col-span-2`}>{t("typeName")}<input name="name" required defaultValue={x.name ?? ""} className={field} /></label>
      <label className={label}>{t("dept")}<select name="department_id" defaultValue={x.department_id ?? ""} className={field}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className={label}>{t("dept2")}<select name="second_department_id" defaultValue={x.second_department_id ?? ""} className={field}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className={label}>{t("defaultOwner")}<select name="default_owner_id" defaultValue={x.default_owner_id ?? ""} className={field}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className={label}>{t("backup")}<select name="backup_id" defaultValue={x.backup_id ?? ""} className={field}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className={label}>{t("respondMin")}<input name="respond_minutes" type="number" min="1" required defaultValue={x.respond_minutes ?? 60} className={field} /></label>
      <label className={label}>{t("fixMin")}<input name="fix_minutes" type="number" min="1" required defaultValue={x.fix_minutes ?? 1440} className={field} /></label>
      <label className={label}>{tb("label")}<select name="business" defaultValue={x.business ?? "icharge"} className={field}><option value="icharge">{tb("icharge")}</option><option value="iscreen">{tb("iscreen")}</option><option value="company">{tb("company")}</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_finance" defaultChecked={!!x.is_finance} className="h-4 w-4 accent-[#2F6B0A]" />{t("isFinance")}</label>
      {x.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={x.active !== false} className="h-4 w-4 accent-[#2F6B0A]" />{t("active")}</label>}
      <button className="h-10 w-fit rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{x.id ? t("save") : t("addType")}</button>
    </form>
  );
  return (
    <>
      <Link href="/issues" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("types")}</h1>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      {((types ?? []) as IT[]).map(form)}
      {form({})}
    </>
  );
}
