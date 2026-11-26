import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { NumberUnit, SaveButton, Switch, WrapField, inputCls } from "@/components/SettingsUi";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveHoliday, saveLeaveType } from "../actions";

export const metadata = { title: "Holidays and leave types" };
type LType = { id?: string; code?: string; name?: string; yearly_days?: number; paid?: boolean; active?: boolean; legal?: boolean };

/** HR settings: holidays (skipped in leave and reminder counts) and leave types (spec 5.3, 11). */
export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.hr || viewer.level === "leader")) notFound();
  const t = await getTranslations("leave");
  const format = await getFormatter();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: hols }, { data: types }] = await Promise.all([supabase.from("holidays").select("*").order("day"), supabase.from("leave_types").select("*").order("position")]);
  const all = (types ?? []) as LType[];
  const typeForm = (x: LType) => (
    <form action={saveLeaveType} className="mt-3 flex flex-col gap-3">
      {x.id && <input type="hidden" name="id" value={x.id} />}
      <label className="flex flex-col gap-1 text-[13px] font-semibold">{t("typeName")}<WrapField name="name" required value={x.name} label={t("typeName")} /></label>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex flex-col gap-1 text-[13px] font-semibold">{t("yearly")}<NumberUnit name="yearly_days" value={x.yearly_days ?? 0} unit={t("daysUnit")} step={0.5} label={t("yearly")} /></span>
        <span className="flex h-11 items-center gap-2 self-end text-sm font-semibold">{t("paid")}<Switch name="paid" on={x.paid !== false} label={t("paid")} /></span>
        {x.id && <span className="flex h-11 items-center gap-2 self-end text-sm font-semibold">{t("activeLabel")}<Switch name="active" on={x.active !== false} label={t("activeLabel")} /></span>}
      </div>
      <SaveButton label={x.id ? t("save") : t("add")} />
    </form>
  );
  const typeRow = (x: LType) => (
    <li key={x.id} className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="min-w-0 text-sm break-words">{x.code === "sil" ? `${t("silName")} (${x.name})` : x.name}</b>
        <span className="flex flex-wrap gap-1.5">{x.legal && <Pill tone="wait">{t("legal")}</Pill>}<Pill tone={x.active ? "ok" : "plain"}>{x.active ? t("on") : t("off")}</Pill></span>
      </div>
      <p className="text-xs text-muted">{t("typeSummary", { n: Number(x.yearly_days ?? 0), paid: x.paid ? t("paid") : t("unpaid") })}</p>
      <details><summary className="mt-1 w-fit cursor-pointer text-xs font-semibold text-leaf">{t("edit")}</summary>{typeForm(x)}</details>
    </li>
  );
  const off = all.filter((x) => !x.active);
  return (
    <>
      <Link href="/hr/leave" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("holidays")} · {t("types")}</h1>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />

      <section className="flex max-w-[760px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <div><h2 className="text-base font-bold">{t("holidays")}</h2><p className="text-xs text-muted">{t("holidaysHelp")}</p></div>
        {(hols ?? []).length === 0 ? <p className="text-sm text-muted">{t("noHolidays")}</p> : (
          <ul className="flex flex-col">
            {(hols ?? []).map((h) => {
              const d = new Date(`${h.day}T12:00:00Z`);
              return (
                <li key={h.day} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                  <span className="flex w-12 flex-none flex-col items-center rounded-lg bg-paper py-1 leading-tight">
                    <span className="text-[11px] font-semibold text-muted uppercase">{format.dateTime(d, { month: "short" })}</span>
                    <span className="text-base font-bold">{format.dateTime(d, { day: "numeric" })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm break-words">{h.name}</b>
                    <span className="text-xs text-muted">{format.dateTime(d, { weekday: "long", year: "numeric" })} · {h.kind === "special" ? t("special") : t("regular")}</span>
                  </span>
                  <form action={saveHoliday}>
                    <input type="hidden" name="day" value={h.day} /><input type="hidden" name="delete" value="1" />
                    <button aria-label={`${t("remove")} ${h.name}`} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"><X aria-hidden size={18} /></button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form action={saveHoliday} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-field p-3 sm:grid-cols-[auto_1fr_auto_auto]">
          <input type="date" name="day" required aria-label={t("holidayDate")} className={inputCls} />
          <input name="name" required placeholder={t("holidayName")} aria-label={t("holidayName")} className={inputCls} />
          <select name="kind" aria-label={t("holidayKind")} className={inputCls}><option value="regular">{t("regular")}</option><option value="special">{t("special")}</option></select>
          <button className="h-11 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("add")}</button>
        </form>
      </section>

      <section className="flex max-w-[760px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <div><h2 className="text-base font-bold">{t("types")}</h2><p className="text-xs text-muted">{t("typesHelp")}</p></div>
        <ul className="flex flex-col">{all.filter((x) => x.active).map(typeRow)}</ul>
        {off.length > 0 && (
          <details className="rounded-xl bg-paper p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">{t("switchedOff", { n: off.length })}</summary>
            <ul className="mt-2 flex flex-col">{off.map(typeRow)}</ul>
          </details>
        )}
        <details className="rounded-xl border border-dashed border-field p-3">
          <summary className="cursor-pointer text-sm font-semibold text-leaf">+ {t("addType")}</summary>
          {typeForm({})}
        </details>
      </section>
    </>
  );
}
