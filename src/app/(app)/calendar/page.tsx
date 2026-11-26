import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { Pill } from "@/components/Pills";
import { inputCls } from "@/components/SettingsUi";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveHoliday } from "../hr/leave/actions";

export const metadata = { title: "Calendar" };

type Kind = "holiday" | "leave" | "meeting" | "task" | "milestone";
type Item = { day: string; kind: Kind; text: string; sub?: string; href?: string; pending?: boolean; holidayKind?: "regular" | "special" };

const DAY = 86400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const manilaToday = () => isoDay(new Date(Date.now() + 8 * 3600_000));
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** Month calendar (spec 4.5): Philippine holidays, who is on leave, meetings, tasks and milestones. Sunday first, like a wall calendar. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("calendar");
  const format = await getFormatter();
  const sp = await searchParams;
  const today = manilaToday();
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d.slice(0, 7) : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), last = new Date(Date.UTC(y, m, 0));
  const gridStart = new Date(first.getTime() - first.getUTCDay() * DAY), gridEnd = new Date(last.getTime() + (6 - last.getUTCDay()) * DAY);
  const from = isoDay(gridStart), to = isoDay(gridEnd);
  const selected = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today.startsWith(month) ? today : `${month}-01`;
  const prev = m === 1 ? ym(y - 1, 12) : ym(y, m - 1), next = m === 12 ? ym(y + 1, 1) : ym(y, m + 1);
  const canEditHolidays = viewer.hr || viewer.level === "leader";

  const supabase = await createClient();
  const [{ data: hols }, { data: leave }, { data: meetings }, { data: tasks }, { data: miles }] = await Promise.all([
    supabase.from("holidays").select("day, name, kind").gte("day", from).lte("day", to),
    supabase.rpc("calendar_leave", { p_from: from, p_to: to }),
    supabase.from("meetings").select("id, title, meeting_at").is("deleted_at", null).gte("meeting_at", `${from}T00:00:00+08:00`).lte("meeting_at", `${to}T23:59:59+08:00`).order("meeting_at"),
    supabase.from("tasks").select("id, title, due_at").is("deleted_at", null).not("status", "in", "(done,cancelled)").gte("due_at", `${from}T00:00:00+08:00`).lte("due_at", `${to}T23:59:59+08:00`).order("due_at").limit(500),
    supabase.from("milestones").select("id, title, due_date, project_id").gte("due_date", from).lte("due_date", to),
  ]);

  const items: Item[] = [];
  const manilaDay = (ts: string) => isoDay(new Date(new Date(ts).getTime() + 8 * 3600_000));
  const time = (ts: string) => format.dateTime(new Date(ts), { hour: "numeric", minute: "2-digit" });
  for (const h of hols ?? []) items.push({ day: h.day, kind: "holiday", text: h.name, holidayKind: h.kind === "special" ? "special" : "regular" });
  for (const l of (leave ?? []) as { request_id: string; name: string; start_date: string; end_date: string; status: string; type_name: string | null }[]) {
    for (let d = new Date(`${l.start_date}T00:00:00Z`); d <= new Date(`${l.end_date}T00:00:00Z`); d = new Date(d.getTime() + DAY)) {
      const day = isoDay(d);
      if (day >= from && day <= to) items.push({ day, kind: "leave", text: l.name, sub: l.type_name ?? undefined, pending: l.status === "pending" });
    }
  }
  for (const x of meetings ?? []) items.push({ day: manilaDay(x.meeting_at), kind: "meeting", text: x.title, sub: time(x.meeting_at), href: `/meetings/${x.id}` });
  for (const x of tasks ?? []) items.push({ day: manilaDay(x.due_at), kind: "task", text: x.title, sub: time(x.due_at), href: `/tasks/${x.id}` });
  for (const x of miles ?? []) items.push({ day: x.due_date, kind: "milestone", text: x.title, href: `/projects/${x.project_id}` });
  const on = (day: string) => items.filter((i) => i.day === day);

  const dot: Record<Kind, string> = { holiday: "bg-danger", leave: "bg-[#D97706]", meeting: "bg-screen", task: "bg-[#2563EB]", milestone: "bg-leaf" };
  const chip: Record<Kind, string> = { holiday: "bg-danger-soft text-danger", leave: "bg-[#FEF3C7] text-[#92400E]", meeting: "bg-screen-soft text-screen-text", task: "bg-[#DBEAFE] text-[#1E40AF]", milestone: "bg-charge-soft text-leaf" };
  const weeks: string[][] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + DAY)) {
    if (d.getUTCDay() === 0) weeks.push([]);
    weeks[weeks.length - 1].push(isoDay(d));
  }
  const weekday = (i: number) => format.dateTime(new Date(Date.UTC(2026, 10, 1 + i)), { weekday: "short", timeZone: "UTC" }); // 1 Nov 2026 is a Sunday
  const monthHolidays = (hols ?? []).filter((h) => h.day.startsWith(month)).sort((a, b) => a.day.localeCompare(b.day));
  const sel = on(selected), selHoliday = sel.find((i) => i.kind === "holiday");
  const href = (day: string) => `/calendar?m=${day.slice(0, 7)}&d=${day}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <nav className="flex flex-wrap items-center gap-2" aria-label={t("title")}>
          <Link href={`/calendar?m=${prev}`} className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-field bg-white text-sm font-semibold" aria-label={t("prev")}>←</Link>
          <span className="min-w-[150px] text-center font-display text-lg font-bold">{format.dateTime(new Date(`${month}-15T12:00:00Z`), { month: "long", year: "numeric" })}</span>
          <Link href={`/calendar?m=${next}`} className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-field bg-white text-sm font-semibold" aria-label={t("next")}>→</Link>
          <Link href="/calendar" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("today")}</Link>
        </nav>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label={t("legend")}>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-danger-soft ring-1 ring-danger/40" />{t("regular")}</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#FEF3C7] ring-1 ring-[#D97706]/40" />{t("special")}</li>
        {(["leave", "meeting", "task", "milestone"] as const).map((k) => <li key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${dot[k]}`} />{t(k)}</li>)}
      </ul>

      <div className="flex flex-col gap-4 min-[1100px]:flex-row min-[1100px]:items-start">
        <section className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-white min-[1100px]:flex-[3_1_0]">
          <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-[11px] font-semibold tracking-wide text-muted uppercase">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className={`py-2 ${i === 0 ? "text-danger" : ""}`}>{weekday(i)}</div>)}
          </div>
          {weeks.map((w) => (
            <div key={w[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
              {w.map((day) => {
                const list = on(day), hol = list.find((i) => i.kind === "holiday"), others = list.filter((i) => i.kind !== "holiday");
                const inMonth = day.startsWith(month), isToday = day === today, isSel = day === selected;
                const tint = hol ? (hol.holidayKind === "regular" ? "bg-danger-soft/70" : "bg-[#FEF3C7]/70") : "";
                return (
                  <Link key={day} href={href(day)} aria-label={format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: "full" })} aria-current={isSel ? "date" : undefined}
                    className={`relative flex min-h-14 min-w-0 flex-col gap-1 border-r border-line p-1 last:border-r-0 min-[700px]:min-h-28 min-[700px]:p-1.5 ${tint} ${inMonth ? "" : "opacity-45"} ${isSel ? "outline outline-2 -outline-offset-2 outline-forest" : "hover:bg-paper"}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-forest text-white" : hol?.holidayKind === "regular" || new Date(`${day}T00:00:00Z`).getUTCDay() === 0 ? "text-danger" : "text-forest"}`}>
                      {Number(day.slice(8))}
                    </span>
                    {/* Computer: names; phone: dots (details below the calendar). */}
                    {hol && <span className={`hidden text-[11px] leading-tight font-semibold break-words min-[700px]:block ${hol.holidayKind === "regular" ? "text-danger" : "text-[#92400E]"}`}>{hol.text}</span>}
                    <span className="hidden min-w-0 flex-col gap-0.5 min-[700px]:flex">
                      {others.slice(0, 3).map((i, k) => (
                        <span key={k} className={`truncate rounded px-1 py-px text-[11px] font-medium ${chip[i.kind]} ${i.pending ? "opacity-70 outline-1 outline-dashed" : ""}`}>{i.kind === "leave" ? `${t("leaveShort")}: ${i.text}` : i.text}</span>
                      ))}
                      {others.length > 3 && <span className="text-[11px] font-semibold text-muted">{t("more", { n: others.length - 3 })}</span>}
                    </span>
                    {list.length > 0 && (
                      <span className="flex flex-wrap gap-0.5 min-[700px]:hidden" aria-hidden>
                        {[...new Set(list.map((i) => i.kind))].map((k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${dot[k]}`} />)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </section>

        <aside className="flex min-w-0 flex-col gap-4 min-[1100px]:max-w-[360px] min-[1100px]:flex-[1_1_0]">
          <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
            <h2 className="text-base font-bold">{format.dateTime(new Date(`${selected}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
            {sp.ok && <p role="status" className="rounded-[10px] bg-charge-soft px-3 py-2 text-[13px] font-semibold text-leaf">{t("saved")}</p>}
            {sp.error && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">{sp.error}</p>}
            {sel.length === 0 && <p className="text-sm text-muted">{t("dayEmpty")}</p>}
            <ul className="flex flex-col gap-2">
              {sel.map((i, k) => (
                <li key={k} className="flex flex-wrap items-start gap-2 text-sm">
                  <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-semibold ${chip[i.kind]}`}>{i.kind === "holiday" ? t(i.holidayKind ?? "regular") : t(i.kind)}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {i.href ? <Link href={i.href} className="font-medium text-forest hover:underline">{i.text}</Link> : <b className="font-semibold">{i.text}</b>}
                    {i.sub && <span className="text-muted"> · {i.sub}</span>}
                    {i.pending && <> <Pill tone="wait">{t("pending")}</Pill></>}
                  </span>
                </li>
              ))}
            </ul>
            {canEditHolidays && (
              selHoliday ? (
                <form action={saveHoliday} className="border-t border-line pt-3">
                  <input type="hidden" name="day" value={selected} /><input type="hidden" name="delete" value="1" /><input type="hidden" name="back" value={href(selected)} />
                  <button className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold text-danger"><X aria-hidden size={16} />{t("removeHoliday")}</button>
                </form>
              ) : (
                <details className="border-t border-line pt-3">
                  <summary className="w-fit cursor-pointer text-sm font-semibold text-leaf">+ {t("addHoliday")}</summary>
                  <form action={saveHoliday} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="day" value={selected} /><input type="hidden" name="back" value={href(selected)} />
                    <input name="name" required placeholder={t("holidayName")} aria-label={t("holidayName")} className={inputCls} />
                    <select name="kind" aria-label={t("holidayKind")} className={inputCls}><option value="regular">{t("regular")}</option><option value="special">{t("special")}</option></select>
                    <button className="h-11 w-fit rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("add")}</button>
                  </form>
                </details>
              )
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-4">
            <h2 className="text-base font-bold">{t("holidaysThisMonth")}</h2>
            {monthHolidays.length === 0 ? <p className="text-sm text-muted">{t("noHolidays")}</p> : (
              <ul className="flex flex-col">
                {monthHolidays.map((h) => (
                  <li key={h.day}>
                    <Link href={href(h.day)} className="flex items-center gap-3 rounded-lg py-1.5 hover:bg-paper">
                      <span className={`w-14 flex-none text-center text-xs font-bold ${h.kind === "regular" ? "text-danger" : "text-[#92400E]"}`}>{format.dateTime(new Date(`${h.day}T12:00:00Z`), { day: "numeric", month: "short" })}</span>
                      <span className="min-w-0 flex-1 text-sm break-words">{h.name}<span className="block text-xs text-muted">{h.kind === "regular" ? t("regular") : t("special")} · {format.dateTime(new Date(`${h.day}T12:00:00Z`), { weekday: "long" })}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {canEditHolidays && <p className="text-xs text-muted">{t("hrHint")}</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
