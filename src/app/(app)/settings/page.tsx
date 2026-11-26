import Link from "next/link";
import { Fragment } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { AppVersionCard } from "@/components/AppVersionCard";
import { Flash } from "@/components/Flash";
import { DayChips, NumberUnit, SaveButton, SettingRow, Switch, TimeInput, WrapField, inputCls } from "@/components/SettingsUi";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { saveDepartment, saveDomain, saveSettings, saveShift } from "./actions";

export const metadata = { title: "Settings" };
const card = "flex max-w-[860px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";

/** Settings in plain groups (spec 11). One Save per group; each key is still checked in the database (who may change it). */
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
  const days = (k: string, d: number[]) => (Array.isArray(val(k)) ? (val(k) as number[]).map(Number) : d);
  const dayLabels = t.raw("dayShort") as string[];
  const csHours = (val("cs_hours") ?? {}) as { start?: string; end?: string; days?: number[] };

  /** A group of settings saved together. */
  const group = (title: string, keys: [string, string][], body: React.ReactNode, help?: string) => (
    <form action={saveSettings} className={card}>
      <div><h2 className="text-base font-bold">{title}</h2>{help && <p className="text-xs text-muted">{help}</p>}</div>
      {keys.map(([k, type]) => <Fragment key={k}><input type="hidden" name="keys" value={k} /><input type="hidden" name={`type:${k}`} value={type} /></Fragment>)}
      <div className="flex flex-col">{body}</div>
      <SaveButton label={t("save")} />
    </form>
  );

  const links: [string, string, boolean][] = [["/issues/types", t("issueTypes"), leader], ["/settings/access", t("access"), hr], ["/settings/updates", t("updates"), leader], ["/hr/attendance/sites", t("sites"), hr || viewer.headOf.includes("ops")],
    ["/hr/leave/holidays", t("holidays"), hr], ["/hr/checklists", t("checklists"), hr], ["/cs/settings", t("cs"), leader || !!lead], ["/settings/backup", t("backup"), leader], ["/profile", t("myProfile"), true]];

  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <Flash ok={sp.ok ? t("saved") : null} error={sp.error} />

      <section className={card}><h2 className="text-base font-bold">{t("appVersion")}</h2><AppVersionCard /></section>

      <section className={card}><h2 className="text-base font-bold">{t("links")}</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {links.filter((l) => l[2]).map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="flex min-h-12 items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2 text-sm font-semibold text-ink-2 hover:border-field hover:bg-paper">
                <span className="min-w-0">{label}</span><ChevronRight aria-hidden size={18} className="flex-none text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {hr && (
        <>
          {group(t("g.week"), [["work_start", "time"], ["work_end", "time"], ["work_days", "days"]], (
            <>
              <SettingRow label={t("k.work_hours")} help={t("h.work_hours")}>
                <TimeInput name="v:work_start" value={val("work_start")} label={t("k.work_start")} /><span className="text-sm text-muted">{t("to")}</span><TimeInput name="v:work_end" value={val("work_end")} label={t("k.work_end")} />
              </SettingRow>
              <SettingRow label={t("k.work_days")} help={t("h.work_days")}><DayChips name="v:work_days" days={days("work_days", [1, 2, 3, 4, 5])} labels={dayLabels} /></SettingRow>
            </>
          ))}
          {group(t("g.timein"), [["location_radius_m", "number"], ["selfie_required", "bool"], ["offline_gap_minutes", "number"], ["probation_months", "number"]], (
            <>
              <SettingRow label={t("k.location_radius_m")} help={t("h.location_radius_m")}><NumberUnit name="v:location_radius_m" value={val("location_radius_m")} unit={t("u.meters")} min={20} step={10} label={t("k.location_radius_m")} /></SettingRow>
              <SettingRow label={t("k.selfie_required")} help={t("h.selfie_required")}><Switch name="v:selfie_required" on={val("selfie_required") !== false} label={t("k.selfie_required")} /></SettingRow>
              <SettingRow label={t("k.offline_gap_minutes")} help={t("h.offline_gap_minutes")}><NumberUnit name="v:offline_gap_minutes" value={val("offline_gap_minutes")} unit={t("u.minutes")} label={t("k.offline_gap_minutes")} /></SettingRow>
              <SettingRow label={t("k.probation_months")} help={t("h.probation_months")}><NumberUnit name="v:probation_months" value={val("probation_months")} unit={t("u.months")} min={1} label={t("k.probation_months")} /></SettingRow>
            </>
          ))}
          {group(t("g.privacy"), [["selfie_days", "number"], ["location_days", "number"]], (
            <>
              <SettingRow label={t("k.selfie_days")} help={t("h.selfie_days")}><NumberUnit name="v:selfie_days" value={val("selfie_days")} unit={t("u.days")} min={1} label={t("k.selfie_days")} /></SettingRow>
              <SettingRow label={t("k.location_days")} help={t("h.location_days")}><NumberUnit name="v:location_days" value={val("location_days")} unit={t("u.days")} min={1} label={t("k.location_days")} /></SettingRow>
            </>
          ))}

          <section className={card}>
            <div><h2 className="text-base font-bold">{t("shifts")}</h2><p className="text-xs text-muted">{t("h.shifts")}</p></div>
            <ul className="flex flex-col gap-3">
              {[...(shifts ?? []), {}].map((s: { id?: string; name?: string; start_time?: string; end_time?: string; days?: number[]; grace_minutes?: number }) => (
                <li key={s.id ?? "new"} className={`rounded-xl border p-3 ${s.id ? "border-line" : "border-dashed border-field"}`}>
                  <form action={saveShift} className="flex flex-col gap-3">
                    {s.id && <input type="hidden" name="id" value={s.id} />}
                    <WrapField name="name" required value={s.name} label={t("shiftName")} placeholder={t("addShift")} className="font-semibold" />
                    <div className="flex flex-wrap items-center gap-2">
                      <TimeInput name="start_time" value={s.start_time ?? "08:00"} label={t("k.work_start")} /><span className="text-sm text-muted">{t("to")}</span><TimeInput name="end_time" value={s.end_time ?? "17:00"} label={t("k.work_end")} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{t("grace")}</span><NumberUnit name="grace" value={s.grace_minutes ?? 0} unit={t("u.minutes")} label={t("grace")} /></div>
                    <DayChips name="days" days={(s.days ?? [1, 2, 3, 4, 5]).map(Number)} labels={dayLabels} />
                    <SaveButton label={s.id ? t("save") : t("addShift")} />
                  </form>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {leader && (
        <>
          {group(t("g.tasks"), [["ack_hours", "number"], ["quiet_start", "time"], ["quiet_end", "time"], ["digest_time", "time"]], (
            <>
              <SettingRow label={t("k.ack_hours")} help={t("h.ack_hours")}><NumberUnit name="v:ack_hours" value={val("ack_hours")} unit={t("u.workingHours")} min={1} label={t("k.ack_hours")} /></SettingRow>
              <SettingRow label={t("k.quiet")} help={t("h.quiet")}>
                <TimeInput name="v:quiet_start" value={val("quiet_start")} label={t("k.quiet_start")} /><span className="text-sm text-muted">{t("to")}</span><TimeInput name="v:quiet_end" value={val("quiet_end")} label={t("k.quiet_end")} />
              </SettingRow>
              <SettingRow label={t("k.digest_time")} help={t("h.digest_time")}><TimeInput name="v:digest_time" value={val("digest_time")} label={t("k.digest_time")} /></SettingRow>
            </>
          ))}
          {group(t("g.signin"), [["lock_hours", "number"], ["email_code_days", "number"], ["session_days", "number"]], (
            <>
              <SettingRow label={t("k.lock_hours")} help={t("h.lock_hours")}><NumberUnit name="v:lock_hours" value={val("lock_hours")} unit={t("u.hours")} min={1} label={t("k.lock_hours")} /></SettingRow>
              <SettingRow label={t("k.email_code_days")} help={t("h.email_code_days")}><NumberUnit name="v:email_code_days" value={val("email_code_days")} unit={t("u.days")} min={1} label={t("k.email_code_days")} /></SettingRow>
              <SettingRow label={t("k.session_days")} help={t("h.session_days")}><NumberUnit name="v:session_days" value={val("session_days")} unit={t("u.days")} min={1} label={t("k.session_days")} /></SettingRow>
            </>
          ))}
          {group(t("g.company"), [["ceo_profile_id", "person"], ["iscreen_bd_commission", "number"], ["cs_anonymize_years", "number"]], (
            <>
              <SettingRow label={t("k.ceo_profile_id")} help={t("h.ceo_profile_id")}>
                <select name="v:ceo_profile_id" defaultValue={typeof val("ceo_profile_id") === "string" ? (val("ceo_profile_id") as string) : ""} aria-label={t("k.ceo_profile_id")} className={`${inputCls} max-w-[240px]`}>
                  <option value="">—</option>{people.filter((p) => p.access_level === "leader").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </SettingRow>
              <SettingRow label={t("k.iscreen_bd_commission")} help={t("h.iscreen_bd_commission")}><NumberUnit name="v:iscreen_bd_commission" value={val("iscreen_bd_commission")} unit="%" step={0.5} label={t("k.iscreen_bd_commission")} /></SettingRow>
              <SettingRow label={t("k.cs_anonymize_years")} help={t("h.cs_anonymize_years")}><NumberUnit name="v:cs_anonymize_years" value={val("cs_anonymize_years")} unit={t("u.years")} min={1} label={t("k.cs_anonymize_years")} /></SettingRow>
            </>
          ))}

          <section className={card}><h2 className="text-base font-bold">{t("departments")}</h2>
            <ul className="flex flex-col">
              {[...depts, { id: "", name: "", code: "", head_id: null }].map((d) => (
                <li key={d.id || "new"} className="border-t border-line py-3 first:border-t-0 first:pt-0">
                  <form action={saveDepartment} className="flex flex-wrap items-center gap-2">
                    {d.id && <input type="hidden" name="id" value={d.id} />}
                    <input name="name" required defaultValue={d.name} aria-label={t("deptName")} placeholder={t("addDept")} className={`${inputCls} min-w-[160px] flex-[2_1_160px]`} />
                    <select name="head_id" defaultValue={d.head_id ?? ""} aria-label={t("head")} className={`${inputCls} min-w-[150px] flex-[1_1_150px]`}><option value="">{t("noHead")}</option>{people.filter((p) => p.access_level !== "staff").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    <button className="h-11 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{d.id ? t("save") : t("addDept")}</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <section className={card}><div><h2 className="text-base font-bold">{t("domains")}</h2><p className="text-xs text-muted">{t("h.domains")}</p></div>
            <div className="flex flex-wrap gap-2">
              {(domains ?? []).map((d) => (
                <form key={d.domain} action={saveDomain} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper py-1 pr-1 pl-3 text-sm font-semibold">
                  <input type="hidden" name="domain" value={d.domain} /><input type="hidden" name="remove" value="1" />@{d.domain}
                  <button aria-label={`${t("remove")} @${d.domain}`} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white hover:text-danger"><X aria-hidden size={16} /></button>
                </form>
              ))}
            </div>
            <form action={saveDomain} className="flex flex-wrap gap-2"><input name="domain" required placeholder="example.com" aria-label={t("addDomain")} className={`${inputCls} min-w-[180px] flex-1`} /><button className="h-11 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("addDomain")}</button></form>
          </section>
        </>
      )}

      {(leader || lead) && group(t("csSet"), [["cs_hours", "cs_hours"]], (
        <>
          <SettingRow label={t("k.cs_hours")} help={t("h.cs_hours")}>
            <TimeInput name="v:cs_start" value={csHours.start ?? "08:00"} label={t("k.work_start")} /><span className="text-sm text-muted">{t("to")}</span><TimeInput name="v:cs_end" value={csHours.end ?? "20:00"} label={t("k.work_end")} />
          </SettingRow>
          <SettingRow label={t("k.cs_days")}><DayChips name="v:cs_days" days={(csHours.days ?? [1, 2, 3, 4, 5, 6, 7]).map(Number)} labels={dayLabels} /></SettingRow>
        </>
      ))}
    </>
  );
}
