import { Fragment } from "react";
import { isCsStaff } from "@/lib/nav";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Battery } from "@/components/Battery";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { saveReview, signReview } from "./actions";

export const metadata = { title: "Performance" };
type Snap = { tasks_completed: number; on_time_pct: number | null; overdue: number; reopened: number; issues_in_target_pct: number | null; issues_handled: number;
  lates: number; late_minutes: number; undertime_minutes: number; outside_location: number; absences: number;
  cs: { reply_15: number | null; solved_in_target: number | null; rating: number | null; handled: number; quality: number | null } | null };
const RATINGS = ["quality", "timeliness", "teamwork", "communication", "initiative"] as const;

/** Monthly snapshot from real data + quarterly review (spec 5.6). Visible to the employee, their Manager, HR and the Leader. */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ who?: string; month?: string; ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  if (isCsStaff(viewer)) redirect("/cs"); // CS staff: CS menu only (src/lib/nav.ts)
  const t = await getTranslations("perf");
  const tc = await getTranslations("cs");
  const format = await getFormatter();
  const sp = await searchParams;
  const supabase = await createClient();
  const people = await getPeople();
  const nowM = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : nowM;
  const who = sp.who ?? viewer.id;
  const { data: snap, error } = await supabase.rpc("performance_snapshot", { p_profile: who, p_month: `${month}-01` });
  const allowed = (await Promise.all(people.map(async (p) => (p.id === viewer.id || viewer.level === "leader" || viewer.hr || (await supabase.rpc("is_manager_of", { target_id: p.id })).data ? p.id : null)))).filter(Boolean) as string[];
  const qNow = `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`;
  const { data: reviews } = await supabase.from("reviews").select("*").eq("profile_id", who).order("quarter", { ascending: false });
  const { data: canWrite } = await supabase.rpc("is_manager_of", { target_id: who });
  const s = snap as Snap | null;
  const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);
  const tile = (label: string, value: string | number, battery?: number | null) => (
    <div key={label} className="flex flex-[1_1_150px] flex-col gap-1.5 rounded-xl border border-line p-3">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="font-display text-2xl font-bold">{value}</span>
      {battery != null && <Battery percent={battery} label={`${label}: ${value}`} />}
    </div>
  );
  const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <form className="flex flex-wrap items-end gap-2">
        {allowed.length > 1 && <label className="flex flex-col gap-1 text-xs font-semibold">{t("person")}<select name="who" defaultValue={who} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm">{people.filter((p) => allowed.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="flex flex-col gap-1 text-xs font-semibold">{t("month")}<input type="month" name="month" defaultValue={month} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm" /></label>
        <button className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">OK</button>
      </form>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error ?? error?.message} />
      {s && (
        <>
          <section className={card}><h2 className="text-base font-bold">{t("tasks")}</h2>
            <div className="flex flex-wrap gap-3">{tile(t("completed"), s.tasks_completed)}{tile(t("onTime"), pct(s.on_time_pct), s.on_time_pct)}{tile(t("overdue"), s.overdue)}{tile(t("reopened"), s.reopened)}</div></section>
          <section className={card}><h2 className="text-base font-bold">{t("issues")}</h2>
            <div className="flex flex-wrap gap-3">{tile(t("issues"), s.issues_handled)}{tile(t("inTarget"), pct(s.issues_in_target_pct), s.issues_in_target_pct)}</div></section>
          {s.cs && <section className={card}><h2 className="text-base font-bold">{t("cs")}</h2>
            <div className="flex flex-wrap gap-3">{tile(tc("kpi.reply_15"), pct(s.cs.reply_15), s.cs.reply_15)}{tile(tc("kpi.solved_in_target"), pct(s.cs.solved_in_target), s.cs.solved_in_target)}{tile(tc("kpi.rating"), s.cs.rating ?? "—")}{tile(tc("kpi.handled"), s.cs.handled)}{tile(t("quality"), s.cs.quality ?? "—")}</div></section>}
          <section className={card}><h2 className="text-base font-bold">{t("attendance")}</h2>
            <div className="flex flex-wrap gap-3">{tile(t("lates"), s.lates)}{tile(t("lateMin"), s.late_minutes)}{tile(t("under"), s.undertime_minutes)}{tile(t("absences"), s.absences)}{tile(t("outside"), s.outside_location)}</div></section>
        </>
      )}
      <section className={card}>
        <h2 className="text-base font-bold">{t("review")}</h2>
        {(reviews ?? []).length === 0 && <p className="text-sm text-muted">{t("noReview")}</p>}
        {(reviews ?? []).map((r) => (
          <div key={r.id} className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
            <b className="text-sm">{r.quarter}</b>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">{RATINGS.map((k) => <Fragment key={k}><dt className="text-muted">{t(`ratings.${k}`)}</dt><dd>{"★".repeat(r.ratings[k] ?? 0)}{"☆".repeat(5 - (r.ratings[k] ?? 0))} <span className="text-muted">({r.ratings[k]}/5)</span></dd></Fragment>)}</dl>
            {r.comments && <p className="whitespace-pre-wrap text-sm">{r.comments}</p>}
            <p className="text-xs text-muted">{t("writtenBy", { name: people.find((p) => p.id === r.written_by)?.name ?? "—" })} · {r.hr_signed_at ? t("signed", { date: format.dateTime(new Date(r.hr_signed_at), { day: "numeric", month: "short", year: "numeric" }) }) : t("notSigned")}</p>
            {!r.hr_signed_at && (viewer.hr || viewer.level === "leader") && r.profile_id !== viewer.id && (
              <form action={signReview}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="profile_id" value={who} /><button className="h-9 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("sign")}</button></form>
            )}
          </div>
        ))}
        {(canWrite || (viewer.level === "leader" && who !== viewer.id)) && (
          <form action={saveReview} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="hidden" name="profile_id" value={who} />
            <label className="flex flex-col gap-1 text-xs font-semibold">{t("quarter")}<input name="quarter" defaultValue={qNow} pattern="\d{4}-Q[1-4]" className="h-10 rounded-[10px] border border-field px-3 text-sm" /></label>
            {RATINGS.map((k) => <label key={k} className="flex flex-col gap-1 text-xs font-semibold">{t(`ratings.${k}`)}<select name={k} defaultValue={3} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>)}
            <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">{t("comments")}<textarea name="comments" rows={3} className="rounded-[10px] border border-field px-3 py-2 text-sm" /></label>
            <button className="h-10 w-fit rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("saveReview")}</button>
          </form>
        )}
      </section>
    </>
  );
}
