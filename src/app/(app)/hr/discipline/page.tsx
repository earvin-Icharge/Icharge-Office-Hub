import Link from "next/link";
import { isCsStaff } from "@/lib/nav";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { fileIncident, issueDiscipline } from "./actions";

export const metadata = { title: "Disciplinary records" };
const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const lab = "flex flex-col gap-1.5 text-[13px] font-semibold";
type Row = { id: string; ref: number; profile_id: string; type: string; case_date: string; status: string; filed_by: string };

export default async function DisciplinePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  if (isCsStaff(viewer)) redirect("/cs"); // CS staff: CS menu only (src/lib/nav.ts)
  const t = await getTranslations("disc");
  const format = await getFormatter();
  const sp = await searchParams;
  const supabase = await createClient();
  const handler = viewer.hr || viewer.level === "leader";
  const [{ data: rows }, people] = await Promise.all([
    supabase.from("discipline_status_v").select("id, ref, profile_id, type, case_date, status, filed_by").order("created_at", { ascending: false }).limit(300),
    getPeople(),
  ]);
  const R = (rows ?? []) as Row[];
  const name = (pid: string) => people.find((p) => p.id === pid)?.name ?? "—";
  const list = (items: Row[], linkable: (r: Row) => boolean) => items.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">{t("none")}</p> : (
    <ul>{items.map((r) => (
      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 first:border-t-0">
        <span className="text-sm">{linkable(r) ? <Link href={`/hr/discipline/${r.id}`} className="font-semibold text-leaf hover:underline">{t("ref", { ref: r.ref })}</Link> : <b>{t("ref", { ref: r.ref })}</b>}
          {" · "}{name(r.profile_id)} · {t(`types.${r.type}`)} · {format.dateTime(new Date(`${r.case_date}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric" })}</span>
        <Pill tone={r.status === "closed" ? "plain" : r.status === "waiting_response" ? "wait" : "info"}>{t(`status.${r.status}`)}</Pill>
      </li>))}</ul>
  );
  const mine = R.filter((r) => r.profile_id === viewer.id);
  const others = R.filter((r) => r.profile_id !== viewer.id);
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <p className="text-sm text-muted">{t("note")}</p>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      <section className="overflow-hidden rounded-[14px] border border-line bg-white"><h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("mine")}</h2>{list(mine, () => true)}</section>
      {(handler || viewer.level === "manager") && (
        <section className="overflow-hidden rounded-[14px] border border-line bg-white">
          <h2 className="px-4 pt-4 pb-1 text-base font-bold">{handler ? t("all") : t("team")}</h2>
          {!handler && <p className="px-4 pb-2 text-xs text-muted">{t("statusOnly")}</p>}
          {list(others, () => handler)}
        </section>
      )}
      {(viewer.level === "manager" || handler) && (
        <form action={fileIncident} className="grid max-w-[760px] grid-cols-1 gap-3 rounded-[14px] border border-line bg-white p-5 sm:grid-cols-2">
          <h2 className="text-base font-bold sm:col-span-2">{t("fileIncident")}</h2>
          <label className={lab}>{t("employee")}<select name="profile_id" required className={field}>{people.filter((p) => p.id !== viewer.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className={lab}>{t("date")}<input type="date" name="case_date" className={field} /></label>
          <label className={`${lab} sm:col-span-2`}>{t("description")}<textarea name="description" required minLength={10} rows={3} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
          <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("send")}</button>
        </form>
      )}
      {handler && (
        <form action={issueDiscipline} className="grid max-w-[760px] grid-cols-1 gap-3 rounded-[14px] border border-line bg-white p-5 sm:grid-cols-2">
          <h2 className="text-base font-bold sm:col-span-2">{t("issue")}</h2>
          <label className={lab}>{t("employee")}<select name="profile_id" required className={field}>{people.filter((p) => p.id !== viewer.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className={lab}>{t("type")}<select name="type" className={field}>{["nte", "verbal_warning", "written_warning", "decision"].map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}</select></label>
          <label className={lab}>{t("date")}<input type="date" name="case_date" className={field} /></label>
          <label className={lab}>{t("responseDays")}<input type="number" name="response_days" min="1" defaultValue={5} className={field} /></label>
          <label className={`${lab} sm:col-span-2`}>{t("description")}<textarea name="description" required rows={3} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
          <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("send")}</button>
        </form>
      )}
    </>
  );
}
