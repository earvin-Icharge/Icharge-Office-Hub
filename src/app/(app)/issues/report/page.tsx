import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Issues weekly report" };

/** Weekly report (spec 4.7): by type and location, repeat problems (same location 3+ times in 30 days). */
export default async function IssueReportPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("issues");
  const supabase = await createClient();
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const since7 = Date.now() - 7 * 86400_000;
  const { data } = await supabase.from("issues").select("id, reported_at, kiosk_id, location, type:issue_types(name)").is("deleted_at", null).gte("reported_at", since30);
  const rows = (data ?? []) as unknown as { id: string; reported_at: string; kiosk_id: string | null; location: string | null; type: { name: string } | null }[];
  const week = rows.filter((r) => new Date(r.reported_at).getTime() >= since7);
  const count = (xs: string[]) => [...xs.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const byType = count(week.map((r) => r.type?.name ?? "—"));
  const byLoc = count(week.map((r) => r.kiosk_id ?? r.location ?? "—"));
  const repeat = count(rows.filter((r) => r.kiosk_id || r.location).map((r) => (r.kiosk_id ?? r.location)!)).filter(([, n]) => n >= 3);
  const table = (title: string, items: [string, number][], empty?: string) => (
    <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
      <h2 className="text-base font-bold">{title}</h2>
      {items.length === 0 ? <p className="text-sm text-muted">{empty ?? "—"}</p> : (
        <table className="w-full text-sm"><tbody>{items.map(([k, n]) => <tr key={k} className="border-t border-line"><td className="py-1.5">{k}</td><td className="py-1.5 text-right font-semibold">{n}</td></tr>)}</tbody></table>
      )}
    </section>
  );
  return (
    <>
      <Link href="/issues" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("weekly")}</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {table(t("byType"), byType)}
        {table(t("byLocation"), byLoc)}
        {table(t("repeat"), repeat, t("noRepeat"))}
      </div>
    </>
  );
}
