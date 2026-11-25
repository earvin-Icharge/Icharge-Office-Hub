import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { saveDepartment, saveDomain, saveSetting, saveShift } from "./actions";

export const metadata = { title: "Settings" };
const field = "h-10 rounded-[10px] border border-field bg-white px-2.5 text-sm min-w-0";
const card = "flex max-w-[860px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const LEADER_KEYS: [string, "number" | "time" | "days" | "person"][] = [["ack_hours", "number"], ["work_start", "time"], ["work_end", "time"], ["work_days", "days"], ["quiet_start", "time"], ["quiet_end", "time"],
  ["digest_time", "time"], ["lock_hours", "number"], ["email_code_days", "number"], ["session_days", "number"], ["iscreen_bd_commission", "number"], ["ceo_profile_id", "person"], ["cs_anonymize_years", "number"]];
const HR_KEYS: [string, "number" | "bool"][] = [["location_radius_m", "number"], ["selfie_required", "bool"], ["selfie_days", "number"], ["location_days", "number"], ["offline_gap_minutes", "number"], ["probation_months", "number"]];

/** Settings per group (spec 11). Each form saves through a rule that checks who may change that key. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("settings");
  const sp = await searchParams;
  const supabase = await createClient();
  const leader = viewer.level === "leader", hr = viewer.hr || leader;
  const [{ data: settings }, { data: lead }, depts, people, { data: domains }, { data: shifts }] = await Promise.all([
    supabase.from("app_settings").select("key, value"), supabase.rpc("is_cs_lead"), getDepartments(), getPeople(),
    leader ? supabase.from("allowed_email_domains").select("domain") : Promise.resolve({ data: null }), supabase.from("shifts").select("*").order("name"),
  ]);
  const val = (k: string) => settings?.find((x) => x.key === k)?.value;
  const row = (k: string, type: string) => {
    const v = val(k);
    return (
      <form key={k} action={saveSetting} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="key" value={k} /><input type="hidden" name="type" value={type} />
        <span className="min-w-[260px] flex-1 text-sm">{t(`k.${k}`)}</span>
        {type === "bool" ? <input type="checkbox" name="value" defaultChecked={v !== false} aria-label={t(`k.${k}`)} className="h-5 w-5 accent-[#2F6B0A]" />
          : type === "person" ? <select name="value" defaultValue={typeof v === "string" ? v : ""} aria-label={t(`k.${k}`)} className={field}><option value="">—</option>{people.filter((p) => p.access_level === "leader").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          : <input name="value" type={type === "number" ? "number" : type === "time" ? "time" : "text"} step="any" defaultValue={Array.isArray(v) ? v.join(",") : v == null ? "" : String(v)} aria-label={t(`k.${k}`)} className={`${field} w-32`} />}
        <button className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">✓</button>
      </form>
    );
  };
  const csHours = (val("cs_hours") ?? {}) as { start?: string; end?: string; days?: number[] };
  const links: [string, string, boolean][] = [["/issues/types", t("issueTypes"), leader], ["/settings/access", t("access"), hr], ["/settings/updates", t("updates"), leader], ["/hr/attendance/sites", t("sites"), hr || viewer.headOf.includes("ops")],
    ["/hr/leave/holidays", t("holidays"), hr], ["/hr/checklists", t("checklists"), hr], ["/cs/settings", t("cs"), leader || !!lead], ["/settings/backup", t("backup"), leader], ["/profile", t("myProfile"), true]];
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <Flash ok={sp.ok ? t("saved") : null} error={sp.error} />
      <section className={card}><h2 className="text-base font-bold">{t("links")}</h2>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{links.filter((l) => l[2]).map(([href, label]) => <li key={href}><Link href={href} className="text-sm font-semibold text-leaf hover:underline">{label}</Link></li>)}</ul></section>
      {leader && (
        <>
          <section className={card}><h2 className="text-base font-bold">{t("company")}</h2>{LEADER_KEYS.map(([k, type]) => row(k, type))}</section>
          <section className={card}><h2 className="text-base font-bold">{t("departments")}</h2>
            {[...depts, { id: "", name: "", code: "", head_id: null }].map((d) => (
              <form key={d.id || "new"} action={saveDepartment} className="flex flex-wrap items-center gap-2">
                {d.id && <input type="hidden" name="id" value={d.id} />}
                <input name="name" required defaultValue={d.name} aria-label="Name" placeholder={t("addDept")} className={`${field} min-w-[180px] flex-1`} />
                {!d.id && <input name="code" placeholder={t("code")} aria-label={t("code")} className={`${field} w-28`} />}
                <select name="head_id" defaultValue={d.head_id ?? ""} aria-label={t("head")} className={field}><option value="">{t("head")}: —</option>{people.filter((p) => p.access_level !== "staff").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <button className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{d.id ? "✓" : t("addDept")}</button>
              </form>
            ))}
          </section>
          <section className={card}><h2 className="text-base font-bold">{t("domains")}</h2>
            {(domains ?? []).map((d) => <form key={d.domain} action={saveDomain} className="flex items-center gap-2"><input type="hidden" name="domain" value={d.domain} /><input type="hidden" name="remove" value="1" /><span className="text-sm font-semibold">@{d.domain}</span><button className="h-8 rounded-lg border border-field bg-white px-2.5 text-xs font-semibold">{t("remove")}</button></form>)}
            <form action={saveDomain} className="flex gap-2"><input name="domain" required placeholder="example.com" aria-label={t("addDomain")} className={field} /><button className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("addDomain")}</button></form>
          </section>
        </>
      )}
      {hr && (
        <section className={card}><h2 className="text-base font-bold">{t("hrSet")}</h2>
          {HR_KEYS.map(([k, type]) => row(k, type))}
          <h3 className="mt-2 text-sm font-bold">{t("shifts")}</h3>
          {[...(shifts ?? []), {}].map((s: { id?: string; name?: string; start_time?: string; end_time?: string; days?: number[]; grace_minutes?: number }) => (
            <form key={s.id ?? "new"} action={saveShift} className="flex flex-wrap items-center gap-2">
              {s.id && <input type="hidden" name="id" value={s.id} />}
              <input name="name" required defaultValue={s.name ?? ""} aria-label="Shift" placeholder={t("addShift")} className={`${field} min-w-[200px] flex-1`} />
              <input name="start_time" type="time" required defaultValue={s.start_time?.slice(0, 5) ?? "08:00"} aria-label="Start" className={field} />
              <input name="end_time" type="time" required defaultValue={s.end_time?.slice(0, 5) ?? "17:00"} aria-label="End" className={field} />
              <input name="days" defaultValue={(s.days ?? [1, 2, 3, 4, 5]).join(",")} aria-label={t("days")} title={t("days")} className={`${field} w-28`} />
              <input name="grace" type="number" defaultValue={s.grace_minutes ?? 0} aria-label={t("grace")} title={t("grace")} className={`${field} w-20`} />
              <button className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{s.id ? "✓" : t("addShift")}</button>
            </form>
          ))}
        </section>
      )}
      {(leader || lead) && (
        <section className={card}><h2 className="text-base font-bold">{t("csSet")}</h2>
          <form action={saveSetting} className="flex flex-wrap items-center gap-2"><input type="hidden" name="key" value="cs_hours" /><input type="hidden" name="type" value="cs_hours" />
            <span className="min-w-[200px] flex-1 text-sm">{t("k.cs_hours")}</span>
            <input name="start" type="time" defaultValue={csHours.start ?? "08:00"} aria-label="Start" className={field} />
            <input name="end" type="time" defaultValue={csHours.end ?? "20:00"} aria-label="End" className={field} />
            <input name="days" defaultValue={(csHours.days ?? [1, 2, 3, 4, 5, 6, 7]).join(",")} aria-label={t("days")} title={t("days")} className={`${field} w-36`} />
            <button className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">✓</button></form>
        </section>
      )}
    </>
  );
}
