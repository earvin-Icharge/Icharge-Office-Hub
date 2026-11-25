import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { TimerPill } from "@/components/TimerPill";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { KpiPanel } from "./KpiPanel";

export const metadata = { title: "Customer service" };
const TABS = ["reply", "waiting", "solved", "all"] as const;
type Row = { id: string; ref: number; channel: string; customer_name: string | null; kiosk_id: string | null; type_code: string; status: string; owner_id: string; created_at: string; first_reply_at: string | null; solved_at: string | null };

export default async function CsPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string; kiosk?: string; ok?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const supabase = await createClient();
  const [{ data: lead }, { data: inCs }] = await Promise.all([supabase.rpc("is_cs_lead"), supabase.rpc("in_cs")]);
  const t = await getTranslations("cs");
  const format = await getFormatter();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "reply";
  const teamView = (lead || viewer.level === "leader") && sp.view !== "mine";
  const csPerson = !!(lead || inCs || viewer.level === "leader");

  let q = supabase.from("cs_cases_v").select("id, ref, channel, customer_name, kiosk_id, type_code, status, owner_id, created_at, first_reply_at, solved_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
  if (!teamView && csPerson) q = q.eq("owner_id", viewer.id);
  if (sp.kiosk) q = q.eq("kiosk_id", sp.kiosk);
  const all = ((await q).data ?? []) as Row[];
  const [{ data: types }, { data: targets }, { data: kpis }] = await Promise.all([
    supabase.from("cs_case_types").select("code, name_en, name_zh, fix_minutes"),
    supabase.from("cs_targets").select("kpi, target"),
    csPerson ? supabase.rpc("cs_kpis", { p_profile: teamView ? null : viewer.id, p_month: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) }) : Promise.resolve({ data: null }),
  ]);
  const type = (code: string) => types?.find((x) => x.code === code);
  const openIds = all.filter((c) => c.status === "open").map((c) => c.id);
  const { data: lastEvents } = openIds.length ? await supabase.from("cs_case_events").select("case_id, kind, at").in("case_id", openIds).in("kind", ["customer", "reply"]).order("at", { ascending: false }) : { data: [] };
  const lastKind = new Map<string, string>();
  for (const e of lastEvents ?? []) if (!lastKind.has(e.case_id)) lastKind.set(e.case_id, e.kind);
  const rows = all.filter((c) => tab === "all" ? true : tab === "solved" ? c.status === "solved" : tab === "waiting" ? ["waiting_customer", "waiting_finance", "sent_to_ops"].includes(c.status)
    : c.status === "open" && (!c.first_reply_at || lastKind.get(c.id) === "customer"));
  const days = [...Array(7)].map((_, i) => new Date(Date.now() + 8 * 3600_000 - (6 - i) * 86400_000).toISOString().slice(0, 10));
  const perDay = days.map((d) => all.filter((c) => new Date(new Date(c.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10) === d).length);
  const max = Math.max(1, ...perDay);
  const label: Record<string, string> = { reply: t("tabReply"), waiting: t("tabWaiting"), solved: t("tabSolved"), all: t("tabAll") };
  const tmap = Object.fromEntries((targets ?? []).map((x) => [x.kpi, Number(x.target)]));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(lead || viewer.level === "leader") && (
            <nav className="inline-flex gap-0.5 rounded-full border border-field bg-white p-[3px]" aria-label={t("title")}>
              {(["mine", "team"] as const).map((v) => <Link key={v} href={`/cs?view=${v}`} aria-current={(v === "team") === teamView ? "page" : undefined} className={`inline-flex h-[34px] items-center rounded-full px-3.5 text-[13px] font-bold ${(v === "team") === teamView ? "bg-forest text-white" : "text-ink-2"}`}>{t(v)}</Link>)}
            </nav>
          )}
          {(viewer.finance || lead || viewer.level === "leader") && <Link href="/cs/refunds" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("refunds")}</Link>}
          {(lead || viewer.level === "leader") && <Link href="/cs/quality" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("quality")}</Link>}
          {(lead || viewer.level === "leader") && <Link href="/cs/settings" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("settings")}</Link>}
          {csPerson && <Link href="/cs/new" className="inline-flex h-11 items-center rounded-[10px] bg-charge px-[18px] text-sm font-semibold text-forest">{t("newCase")}</Link>}
        </div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} />
      {csPerson && kpis && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
          <h2 className="text-base font-bold">{t("kpis")}</h2>
          <KpiPanel kpis={kpis as Record<string, number | null>} targets={tmap} />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("week")}</h3>
            <div role="img" aria-label={`${t("week")}: ${perDay.join(", ")}`} className="flex h-24 items-end gap-2">
              {perDay.map((n, i) => (
                <div key={days[i]} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold">{n}</span>
                  <div className="w-full rounded-t-md bg-charge" style={{ height: `${(n / max) * 64 + 2}px` }} />
                  <span className="text-[11px] text-muted">{format.dateTime(new Date(`${days[i]}T12:00:00Z`), { weekday: "short" })}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <nav className="flex flex-wrap gap-2 px-4 pt-4 pb-3.5" aria-label={t("title")}>
          {TABS.map((k) => <Link key={k} href={`/cs?tab=${k}${sp.view ? `&view=${sp.view}` : ""}`} aria-current={tab === k ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] ${tab === k ? "bg-forest font-semibold text-white" : "border border-[#D5DCCB] bg-white font-medium"}`}>{label[k]}</Link>)}
        </nav>
        {rows.length === 0 ? (
          <div className="flex items-center gap-3.5 border-t border-line px-4 py-[18px]"><Image src="/mascot/thumbs-up.png" alt="" width={64} height={64} className="h-16 w-16 object-contain" /><span className="text-sm text-muted">{t("none")}</span></div>
        ) : (
          <ul>
            {rows.map((c) => {
              const ty = type(c.type_code);
              const replyDue = new Date(new Date(c.created_at).getTime() + (c.channel === "email" ? 240 : 15) * 60000).toISOString();
              const fixDue = new Date(new Date(c.created_at).getTime() + (ty?.fix_minutes ?? 1440) * 60000).toISOString();
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5">
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                    <Link href={`/cs/${c.id}`} className="text-[15px] font-semibold text-forest hover:underline">{t("ref", { ref: c.ref })} · {viewer.language === "zh-Hans" ? ty?.name_zh : ty?.name_en}</Link>
                    <span className="text-[13px] text-muted">{c.customer_name ?? "—"} · {t(`channel.${c.channel}`)}{c.kiosk_id ? ` · ${c.kiosk_id}` : ""}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.status !== "solved" && !c.first_reply_at && <TimerPill label={t("replyTimer")} start={c.created_at} due={replyDue} />}
                    <TimerPill label={t("fixTimer")} start={c.created_at} due={fixDue} stopped={c.solved_at} />
                    <Pill tone={c.status === "solved" ? "ok" : c.status === "open" ? "new" : "wait"}>{t(`status.${c.status}`)}</Pill>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
