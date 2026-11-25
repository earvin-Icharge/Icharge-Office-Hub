import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Meetings" };
export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("meetings");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data } = await supabase.from("meetings").select("id, title, meeting_at, location, meeting_attendees(profile_id)").is("deleted_at", null).order("meeting_at", { ascending: false }).limit(200);
  const now = Date.now();
  const rows = (data ?? []) as { id: string; title: string; meeting_at: string; location: string | null; meeting_attendees: { profile_id: string }[] }[];
  const upcoming = rows.filter((m) => new Date(m.meeting_at).getTime() >= now - 3 * 3600_000).reverse();
  const past = rows.filter((m) => new Date(m.meeting_at).getTime() < now - 3 * 3600_000);
  const sp = await searchParams;
  const list = (items: typeof rows) => items.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{t("none")}</p> : (
    <ul>{items.map((m) => (
      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 first:border-t-0">
        <Link href={`/meetings/${m.id}`} className="font-semibold text-forest hover:underline">{m.title}</Link>
        <span className="text-sm text-muted">{format.dateTime(new Date(m.meeting_at), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          {m.location ? ` · ${m.location}` : ""} · {t("attendeeCount", { n: m.meeting_attendees.length })}</span>
      </li>))}</ul>
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <Link href="/meetings/new" className="inline-flex h-11 items-center rounded-[10px] bg-charge px-[18px] text-sm font-semibold text-forest">{t("newMeeting")}</Link>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} />
      <section className="overflow-hidden rounded-[14px] border border-line bg-white"><h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("upcoming")}</h2>{list(upcoming)}</section>
      <section className="overflow-hidden rounded-[14px] border border-line bg-white"><h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("past")}</h2>{list(past)}</section>
    </>
  );
}
