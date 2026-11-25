import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveHoliday, saveLeaveType } from "../actions";

export const metadata = { title: "Holidays and leave types" };
const field = "h-10 rounded-[10px] border border-field bg-white px-2.5 text-sm min-w-0";

/** HR settings: holidays (skipped in leave and reminder counts) and leave types (spec 5.3, 11). */
export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.hr || viewer.level === "leader")) notFound();
  const t = await getTranslations("leave");
  const format = await getFormatter();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: hols }, { data: types }] = await Promise.all([supabase.from("holidays").select("*").order("day"), supabase.from("leave_types").select("*").order("position")]);
  return (
    <>
      <Link href="/hr/leave" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("holidays")} · {t("types")}</h1>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />
      <section className="flex max-w-[760px] flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("holidays")}</h2>
        <ul className="flex flex-col gap-1">
          {(hols ?? []).map((h) => (
            <li key={h.day}><form action={saveHoliday} className="flex flex-wrap items-center gap-2 text-sm"><input type="hidden" name="day" value={h.day} /><input type="hidden" name="delete" value="1" />
              <span className="w-[120px]">{format.dateTime(new Date(`${h.day}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span><b>{h.name}</b><span className="text-xs text-muted">{h.kind === "special" ? t("special") : t("regular")}</span>
              <button className="h-8 rounded-lg border border-field bg-white px-2.5 text-xs font-semibold">{t("remove")}</button></form></li>
          ))}
        </ul>
        <form action={saveHoliday} className="flex flex-wrap items-end gap-2">
          <input type="date" name="day" required aria-label="Date" className={field} />
          <input name="name" required placeholder={t("holidayName")} aria-label={t("holidayName")} className={`${field} min-w-[200px] flex-1`} />
          <select name="kind" aria-label="Kind" className={field}><option value="regular">{t("regular")}</option><option value="special">{t("special")}</option></select>
          <button className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("add")}</button>
        </form>
      </section>
      <section className="flex max-w-[760px] flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("types")}</h2>
        {[...(types ?? []), {}].map((x: { id?: string; name?: string; yearly_days?: number; paid?: boolean; active?: boolean }) => (
          <form key={x.id ?? "new"} action={saveLeaveType} className="flex flex-wrap items-center gap-2">
            {x.id && <input type="hidden" name="id" value={x.id} />}
            <input name="name" required defaultValue={x.name ?? ""} aria-label="Name" placeholder={t("type")} className={`${field} min-w-[200px] flex-1`} />
            <input name="yearly_days" type="number" step="0.5" required defaultValue={x.yearly_days ?? 0} aria-label={t("yearly")} title={t("yearly")} className={`${field} w-24`} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="paid" defaultChecked={x.paid !== false} className="h-4 w-4 accent-[#2F6B0A]" />{t("paid")}</label>
            {x.id && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={x.active !== false} className="h-4 w-4 accent-[#2F6B0A]" />Active</label>}
            <button className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{x.id ? t("save") : t("add")}</button>
          </form>
        ))}
      </section>
    </>
  );
}
