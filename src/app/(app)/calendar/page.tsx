import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Calendar" };

type Item = { day: string; kind: "task" | "milestone" | "holiday" | "leave"; text: string; href?: string; time?: string };

function monthOf(m?: string) {
  const now = new Date(Date.now() + 8 * 3600_000);
  const [y, mo] = (m && /^\d{4}-\d{2}$/.test(m) ? m : now.toISOString().slice(0, 7)).split("-").map(Number);
  return { y, mo };
}
const iso = (y: number, mo: number) => `${y}-${String(mo).padStart(2, "0")}`;

/** Calendar (spec 4.5): tasks, project milestones, approved leave and holidays; each person sees what their access allows. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("calendar");
  const format = await getFormatter();
  const { y, mo } = monthOf((await searchParams).m);
  const start = `${iso(y, mo)}-01`;
  const next = mo === 12 ? iso(y + 1, 1) : iso(y, mo + 1);
  const prev = mo === 1 ? iso(y - 1, 12) : iso(y, mo - 1);
  const supabase = await createClient();
  const [{ data: tasks }, { data: miles }, { data: hols }, leave] = await Promise.all([
    supabase.from("tasks").select("id, title, due_at, status").is("deleted_at", null).neq("status", "cancelled")
      .gte("due_at", `${start}T00:00:00+08:00`).lt("due_at", `${next}-01T00:00:00+08:00`).order("due_at").limit(500),
    supabase.from("milestones").select("id, title, due_date, project_id").gte("due_date", start).lt("due_date", `${next}-01`),
    supabase.from("holidays").select("day, name").gte("day", start).lt("day", `${next}-01`),
    supabase.from("leave_requests").select("id, start_date, end_date, profile:profiles!leave_requests_profile_id_fkey(name)").eq("status", "approved")
      .lte("start_date", `${next}-01`).gte("end_date", start).then((r) => r, () => ({ data: null })),
  ]);
  const items: Item[] = [];
  for (const x of tasks ?? []) {
    const local = new Date(new Date(x.due_at).getTime() + 8 * 3600_000).toISOString();
    items.push({ day: local.slice(0, 10), kind: "task", text: x.title, href: `/tasks/${x.id}`, time: format.dateTime(new Date(x.due_at), { hour: "numeric", minute: "2-digit" }) });
  }
  for (const m of miles ?? []) items.push({ day: m.due_date, kind: "milestone", text: m.title, href: `/projects/${m.project_id}` });
  for (const h of hols ?? []) items.push({ day: h.day, kind: "holiday", text: h.name });
  for (const l of ((leave as { data: unknown }).data ?? []) as { start_date: string; end_date: string; profile: { name: string } | null }[]) {
    for (let d = new Date(`${l.start_date}T00:00:00Z`); d <= new Date(`${l.end_date}T00:00:00Z`); d = new Date(d.getTime() + 86400_000)) {
      const day = d.toISOString().slice(0, 10);
      if (day.startsWith(iso(y, mo))) items.push({ day, kind: "leave", text: l.profile?.name ?? "—" });
    }
  }
  const days = [...new Set(items.map((i) => i.day))].sort();
  const tone = { task: "bg-[#DBEAFE] text-[#1E40AF]", milestone: "bg-charge-soft text-leaf", holiday: "bg-danger-soft text-danger", leave: "bg-[#FEF3C7] text-[#92400E]" };
  const todayIso = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <nav className="flex items-center gap-2" aria-label={t("title")}>
          <Link href={`/calendar?m=${prev}`} className="inline-flex h-10 items-center rounded-[10px] border border-field bg-white px-3 text-sm font-semibold" aria-label={t("prev")}>←</Link>
          <span className="min-w-[150px] text-center font-semibold">{format.dateTime(new Date(`${start}T12:00:00Z`), { month: "long", year: "numeric" })}</span>
          <Link href={`/calendar?m=${next}`} className="inline-flex h-10 items-center rounded-[10px] border border-field bg-white px-3 text-sm font-semibold" aria-label={t("next")}>→</Link>
          <Link href="/calendar" className="inline-flex h-10 items-center rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("today")}</Link>
        </nav>
      </div>
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        {days.length === 0 && <p className="p-4 text-sm text-muted">{t("nothing")}</p>}
        <ul>
          {days.map((day) => (
            <li key={day} className={`flex flex-wrap gap-3 border-t border-line px-4 py-3 first:border-t-0 ${day === todayIso ? "bg-charge-soft" : ""}`}>
              <span className="w-[110px] flex-none text-sm font-semibold">{format.dateTime(new Date(`${day}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short" })}</span>
              <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                {items.filter((i) => i.day === day).map((i, k) => (
                  <li key={k} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[i.kind]}`}>{t(i.kind)}</span>
                    {i.time && <span className="text-xs text-muted">{i.time}</span>}
                    {i.href ? <Link href={i.href} className="font-medium text-forest hover:underline">{i.text}</Link> : <span>{i.text}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
