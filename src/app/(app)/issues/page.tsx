import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { BusinessPill } from "@/components/BusinessPill";
import { BusinessSwitch } from "@/components/BusinessSwitch";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { TimerPill } from "@/components/TimerPill";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Issue log" };
const TABS = ["open", "mine", "late", "closed"] as const;
type Row = { id: string; ref: number; title: string; status: string; severity: string; business: "icharge" | "iscreen" | "company"; kiosk_id: string | null; location: string | null;
  reported_at: string; respond_due: string; fix_due: string; acknowledged_at: string | null; resolved_at: string | null; owner_id: string | null;
  type: { name: string } | null; owner: { name: string } | null };

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "open";
  const t = await getTranslations("issues");
  const format = await getFormatter();
  const supabase = await createClient();
  let q = supabase.from("issues").select("id, ref, title, status, severity, business, kiosk_id, location, reported_at, respond_due, fix_due, acknowledged_at, resolved_at, owner_id, type:issue_types(name), owner:profiles!issues_owner_id_fkey(name)").is("deleted_at", null);
  if (tab === "closed") q = q.in("status", ["resolved", "closed"]).order("resolved_at", { ascending: false });
  else {
    q = q.not("status", "in", "(resolved,closed)").order("fix_due");
    if (tab === "mine") q = q.eq("owner_id", viewer.id);
    if (tab === "late") q = q.lt("fix_due", new Date().toISOString());
  }
  if (viewer.defaultBusiness !== "all") q = q.eq("business", viewer.defaultBusiness);
  const rows = ((await q.limit(200)).data ?? []) as unknown as Row[];
  const label: Record<string, string> = { open: t("tabOpen"), mine: t("tabMine"), late: t("tabLate"), closed: t("tabClosed") };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/issues/report" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("weekly")}</Link>
          {viewer.level === "leader" && <Link href="/issues/types" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("types")}</Link>}
          <Link href="/issues/new" className="inline-flex h-11 items-center rounded-[10px] bg-charge px-[18px] text-sm font-semibold text-forest">{t("report")}</Link>
        </div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} />
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pt-4 pb-3.5">
          <nav className="flex flex-wrap gap-2" aria-label={t("title")}>
            {TABS.map((k) => <Link key={k} href={`/issues?tab=${k}`} aria-current={tab === k ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] ${tab === k ? "bg-forest font-semibold text-white" : "border border-[#D5DCCB] bg-white font-medium"}`}>{label[k]}</Link>)}
          </nav>
          <BusinessSwitch value={viewer.defaultBusiness} />
        </div>
        {rows.length === 0 ? (
          <div className="flex items-center gap-3.5 border-t border-line px-4 py-[18px]"><Image src="/mascot/thumbs-up.png" alt="" width={64} height={64} className="h-16 w-16 object-contain" /><span className="text-sm text-muted">{t("none")}</span></div>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5">
                <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
                  <Link href={`/issues/${r.id}`} className="text-[15px] font-semibold text-forest hover:underline">{t("ref", { ref: r.ref })} · {r.title}</Link>
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted"><BusinessPill business={r.business} />{r.type?.name}{r.kiosk_id || r.location ? ` · ${r.kiosk_id ?? r.location}` : ""} · {r.owner?.name ?? "—"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{format.dateTime(new Date(r.reported_at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  {!["resolved", "closed"].includes(r.status) && !r.acknowledged_at && <TimerPill label={t("respond")} start={r.reported_at} due={r.respond_due} />}
                  <TimerPill label={t("fix")} start={r.reported_at} due={r.fix_due} stopped={r.resolved_at} />
                  <Pill tone={r.severity === "critical" ? "bad" : r.status === "new" ? "new" : ["resolved", "closed"].includes(r.status) ? "ok" : "info"}>{t(`status.${r.status}`)}</Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
