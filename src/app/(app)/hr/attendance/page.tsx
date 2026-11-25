import Link from "next/link";
import { Fragment } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { toManilaInput } from "@/lib/time";
import { getViewer } from "@/lib/viewer";
import { correctAttendance, openProof, reviewAttendance } from "./actions";
import { ClockPanel } from "./ClockPanel";
import { WfhRequest } from "./WfhRequest";

export const metadata = { title: "Attendance" };
type Att = { id: string; profile_id: string; day: string; mode: string; time_in: string; time_out: string | null; late_minutes: number; undertime_minutes: number;
  in_distance_m: number | null; location_ok: boolean | null; flags: string[]; reviewed_at: string | null; device_time_in: string | null; received_at_in: string; corrected: boolean; field_other_reason: string | null; employee_reason: string | null };
const SEL = "id, profile_id, day, mode, time_in, time_out, late_minutes, undertime_minutes, in_distance_m, location_ok, flags, reviewed_at, device_time_in, received_at_in, corrected, field_other_reason, employee_reason";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("att");
  const format = await getFormatter();
  const sp = await searchParams;
  const time = (x?: string | null) => (x ? format.dateTime(new Date(x), { hour: "numeric", minute: "2-digit" }) : "—");
  const supabase = await createClient();
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const month0 = `${today.slice(0, 7)}-01`;
  const hrView = viewer.hr || viewer.level === "leader";
  const [{ data: mine }, { data: sites }, { data: selfieSetting }, people] = await Promise.all([
    supabase.from("attendance").select(SEL).eq("profile_id", viewer.id).gte("day", month0).order("day", { ascending: false }),
    supabase.from("field_sites").select("id, name").eq("active", true).order("name"),
    supabase.from("app_settings").select("value").eq("key", "selfie_required").single(),
    getPeople(),
  ]);
  const todayRec = ((mine ?? []) as Att[]).find((a) => a.day === today);
  const name = (pid: string) => people.find((p) => p.id === pid)?.name ?? "—";
  const status = (a: Att) => a.in_distance_m == null ? (a.mode === "office" ? "" : t("noPin")) : a.location_ok ? t("verified")
    : a.in_distance_m >= 1000 ? t("away", { km: (a.in_distance_m / 1000).toFixed(1) }) : t("awayM", { m: a.in_distance_m });
  const row = (a: Att, opts: { who?: boolean; hr?: boolean } = {}) => (
    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 first:border-t-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="text-sm">{opts.who ? `${name(a.profile_id)} · ` : ""}{format.dateTime(new Date(`${a.day}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short" })}</b>
        <span className="text-xs text-muted">{t(a.mode)} · {t("in")} {time(a.time_in)} · {t("outCol")} {time(a.time_out)}{a.late_minutes ? ` · ${t("late", { n: a.late_minutes })}` : ""}{a.undertime_minutes ? ` · ${t("under", { n: a.undertime_minutes })}` : ""}{a.field_other_reason ? ` · ${a.field_other_reason}` : ""}{a.employee_reason ? ` · “${a.employee_reason}”` : ""}</span>
        {opts.hr && a.device_time_in && <span className="text-xs text-muted">Phone {time(a.device_time_in)} · received {time(a.received_at_in)}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {status(a) && <Pill tone={a.location_ok ? "ok" : "wait"}>{status(a)}</Pill>}
        {a.flags.map((f) => <Pill key={f} tone="bad">{t.has(`flags.${f}`) ? t(`flags.${f}`) : f}</Pill>)}
        {a.corrected && <Pill>corrected</Pill>}
        {opts.hr && <form action={openProof}><input type="hidden" name="id" value={a.id} /><button className="h-8 rounded-lg border border-field bg-white px-2.5 text-xs font-semibold">{t("viewProof")}</button></form>}
        {opts.hr && !a.reviewed_at && a.flags.length > 0 && <form action={reviewAttendance}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="tab" value={sp.tab ?? "flags"} /><button className="h-8 rounded-lg bg-charge px-2.5 text-xs font-bold text-forest">{t("review")}</button></form>}
        {opts.hr && (
          <details className="w-full"><summary className="cursor-pointer text-xs font-semibold text-leaf">{t("correct")}</summary>
            <form action={correctAttendance} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="tab" value={sp.tab ?? "all"} />
              <input type="datetime-local" name="time_in" defaultValue={toManilaInput(a.time_in)} aria-label={t("in")} className="h-9 rounded-lg border border-field px-2 text-xs" />
              <input type="datetime-local" name="time_out" defaultValue={toManilaInput(a.time_out)} aria-label={t("outCol")} className="h-9 rounded-lg border border-field px-2 text-xs" />
              <input name="reason" required minLength={3} placeholder={t("correctReason")} aria-label={t("correctReason")} className="h-9 rounded-lg border border-field px-2 text-xs sm:col-span-2" />
              <button className="h-9 w-fit rounded-lg border border-field bg-white px-3 text-xs font-semibold">{t("save")}</button></form></details>
        )}
      </span>
    </li>
  );

  let teamRows: Att[] = [];
  if (viewer.level === "manager" || hrView) {
    const { data } = await supabase.from("attendance").select(SEL).eq("day", today).neq("profile_id", viewer.id);
    teamRows = (data ?? []) as Att[];
  }
  const tab = sp.tab ?? "flags";
  let hrRows: Att[] = [];
  if (hrView) {
    let q = supabase.from("attendance").select(SEL).order("day", { ascending: false }).limit(300);
    if (tab === "flags") q = q.is("reviewed_at", null).neq("flags", "{}");
    else if (tab === "today") q = q.eq("day", today);
    else q = q.gte("day", month0);
    hrRows = ((await q).data ?? []) as Att[];
  }
  const teamIds = new Set(teamRows.map((r) => r.profile_id));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          {(hrView || viewer.finance) && <a href={`/api/export/attendance?month=${today.slice(0, 7)}`} className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("export")}</a>}
          {(hrView || viewer.headOf.includes("ops")) && <Link href="/hr/attendance/sites" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("sites")}</Link>}
        </div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      <section className="flex max-w-[560px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="font-display text-lg font-bold">{todayRec ? t("timeOut") : t("timeIn")}</h2>
        {todayRec && <p className="text-sm">{t("already", { time: time(todayRec.time_in), mode: t(todayRec.mode) })}{todayRec.time_out ? ` ${t("out", { time: time(todayRec.time_out) })}` : ""}</p>}
        {!todayRec && <ClockPanel mode="in" sites={sites ?? []} timedIn={false} selfieRequired={selfieSetting?.value !== false} />}
        {todayRec && !todayRec.time_out && <ClockPanel mode="out" sites={sites ?? []} timedIn selfieRequired={false} />}
        <p className="text-xs text-muted">{t("privacy")}</p>
        <WfhRequest />
      </section>
      {(viewer.level === "manager" || hrView) && (
        <section className="overflow-hidden rounded-[14px] border border-line bg-white">
          <h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("team")}</h2>
          <ul>{teamRows.map((a) => row(a, { who: true }))}</ul>
          <p className="px-4 pb-4 text-sm text-muted">{t("notIn")}: {people.filter((p) => p.id !== viewer.id && !teamIds.has(p.id)).length}</p>
        </section>
      )}
      {hrView && (
        <section className="overflow-hidden rounded-[14px] border border-line bg-white">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3">
            <h2 className="mr-2 text-base font-bold">{t("hr")}</h2>
            {(["flags", "today", "all"] as const).map((k) => <Link key={k} href={`/hr/attendance?tab=${k}`} aria-current={tab === k ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] ${tab === k ? "bg-forest font-semibold text-white" : "border border-[#D5DCCB] bg-white"}`}>{k === "flags" ? t("flagsTab") : k === "today" ? t("today") : t("all")}</Link>)}
          </div>
          <ul>{hrRows.map((a) => row(a, { who: true, hr: true }))}</ul>
        </section>
      )}
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("myMonth")}</h2>
        <ul>{((mine ?? []) as Att[]).map((a) => <Fragment key={a.id}>{row(a)}</Fragment>)}</ul>
      </section>
    </>
  );
}
