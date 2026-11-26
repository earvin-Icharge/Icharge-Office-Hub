import { getTranslations } from "next-intl/server";
import { isCsStaff } from "@/lib/nav";
import { redirect } from "next/navigation";
import { getDepartments, getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Reports" };
const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const lab = "flex flex-col gap-1.5 text-[13px] font-semibold";

/** Excel export with filters (spec 9). Each export holds only what the person's access allows. */
export default async function ReportsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  if (isCsStaff(viewer)) redirect("/cs"); // CS staff: CS menu only (src/lib/nav.ts)
  const t = await getTranslations("reports");
  const tb = await getTranslations("business");
  const [depts, people] = await Promise.all([getDepartments(), getPeople()]);
  const now = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const from = `${now.slice(0, 7)}-01`;
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <p className="text-sm text-muted">{t("help")}</p>
      <form action="/api/export/report" method="get" className="grid max-w-[760px] grid-cols-1 gap-3 rounded-[14px] border border-line bg-white p-5 sm:grid-cols-2">
        <label className={lab}>{t("kind")}<select name="kind" className={field}>{["tasks", "projects", "issues", "attendance", "leave", "performance"].map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</select></label>
        <label className={lab}>{t("business")}<select name="business" defaultValue={viewer.defaultBusiness} className={field}><option value="all">{tb("all")}</option><option value="icharge">{tb("icharge")}</option><option value="iscreen">{tb("iscreen")}</option><option value="company">{tb("company")}</option></select></label>
        <label className={lab}>{t("dept")}<select name="dept" className={field}><option value="">{t("all")}</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className={lab}>{t("person")}<select name="person" className={field}><option value="">{t("all")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className={lab}>{t("from")}<input type="date" name="from" defaultValue={from} className={field} /></label>
        <label className={lab}>{t("to")}<input type="date" name="to" defaultValue={now} className={field} /></label>
        <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("download")}</button>
      </form>
    </>
  );
}
