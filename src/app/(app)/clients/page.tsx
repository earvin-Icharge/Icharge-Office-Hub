import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BusinessPill } from "@/components/BusinessPill";
import { BusinessSwitch } from "@/components/BusinessSwitch";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { countdown, PRE_SIGN } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";
import { TONE_CLS } from "@/lib/timers";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Clients" };
type Row = { id: string; name: string; type: string; business: "icharge" | "iscreen"; status: string; owner_id: string; owner: { name: string } | null; contracts: { end_date: string }[]; client_kiosks: { kiosk_id: string }[] };

/** Client tracker (spec 4.8): My clients / My team (BD head) / All (Leader, Finance). */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const supabase = await createClient();
  const [{ data: canUse }, { data: bdHead }] = await Promise.all([supabase.rpc("can_use_clients"), supabase.rpc("is_bd_head")]);
  if (!canUse) notFound();
  const t = await getTranslations("clients");
  const format = await getFormatter();
  const sp = await searchParams;
  const wide = viewer.level === "leader" || viewer.finance || !!bdHead;
  const view = wide && sp.view === "mine" ? "mine" : wide ? "team" : "mine";
  let q = supabase.from("clients").select("id, name, type, business, status, owner_id, owner:profiles!clients_owner_id_fkey(name), contracts(end_date), client_kiosks(kiosk_id)").is("deleted_at", null).order("name");
  if (view === "mine") q = q.eq("owner_id", viewer.id);
  if (viewer.defaultBusiness !== "all") q = q.eq("business", viewer.defaultBusiness);
  const rows = ((await q).data ?? []) as unknown as Row[];
  const withEnd = rows.map((r) => ({ ...r, end: r.contracts.map((c) => c.end_date).sort().at(-1) ?? null }));
  const zero = await Promise.all(withEnd.map(async (r) => ((await supabase.rpc("client_zero_usage", { p_client: r.id })).data ? r.id : null)));
  const zeroSet = new Set(zero.filter(Boolean));
  const renewals = withEnd.filter((r) => { const c = countdown(r.end); return c && c.days >= 0 && c.days <= 90 && !["renewed", "ended"].includes(r.status); });
  const tiles = [
    { label: t("tiles.clients"), n: rows.length }, { label: t("tiles.renewals"), n: renewals.length },
    { label: t("tiles.unsigned"), n: rows.filter((r) => PRE_SIGN.includes(r.status)).length }, { label: t("tiles.zero"), n: zeroSet.size },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessSwitch value={viewer.defaultBusiness} />
          {wide && (
            <nav className="inline-flex gap-0.5 rounded-full border border-field bg-white p-[3px]" aria-label={t("title")}>
              {(["mine", "team"] as const).map((v) => <Link key={v} href={`/clients?view=${v}`} aria-current={view === v ? "page" : undefined} className={`inline-flex h-[34px] items-center rounded-full px-3.5 text-[13px] font-bold ${view === v ? "bg-forest text-white" : "text-ink-2"}`}>{v === "mine" ? t("mine") : bdHead ? t("team") : t("all")}</Link>)}
            </nav>
          )}
          {(viewer.level === "leader" || viewer.finance || viewer.headOf.includes("ops")) && <Link href="/clients/usage" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("usage")}</Link>}
          {(viewer.level === "leader" || viewer.finance) && <Link href="/clients/payouts" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("payouts")}</Link>}
          {(viewer.level === "leader" || bdHead || viewer.departmentCode === "bd") && <Link href="/clients/new" className="inline-flex h-11 items-center rounded-[10px] bg-charge px-[18px] text-sm font-semibold text-forest">{t("newClient")}</Link>}
        </div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} />
      <div className="flex flex-wrap gap-4">
        {tiles.map((x) => <div key={x.label} className="flex flex-[1_1_150px] flex-col gap-1 rounded-[14px] border border-line bg-white px-[18px] py-4"><span className="font-display text-[32px] font-bold">{x.n}</span><span className="text-sm">{x.label}</span></div>)}
      </div>
      {renewals.length > 0 && <p className="rounded-[14px] border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm font-semibold">{t("banner", { n: renewals.length })}</p>}
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        {rows.length === 0 ? (
          <div className="flex items-center gap-3.5 px-4 py-[18px]"><Image src="/mascot/thumbs-up.png" alt="" width={64} height={64} className="h-16 w-16 object-contain" /><span className="text-sm text-muted">{t("none")}</span></div>
        ) : (
          <ul>
            {withEnd.map((r) => {
              const c = countdown(r.end);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5 first:border-t-0">
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                    <Link href={`/clients/${r.id}`} className="text-[15px] font-semibold text-forest hover:underline">{r.name}</Link>
                    <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted"><BusinessPill business={r.business} />{t(`type.${r.type}`)} · {r.owner?.name} · {r.client_kiosks.length} kiosks</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {zeroSet.has(r.id) && <Pill tone="bad">{t("tiles.zero")}</Pill>}
                    <Pill tone={r.status === "active" || r.status === "renewed" ? "ok" : r.status === "ended" ? "plain" : "info"}>{t(`status.${r.status}`)}</Pill>
                    {c && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLS[c.tone]}`}>{c.days >= 0 ? t("daysLeft", { n: c.days }) : t("ended", { n: -c.days })} · {t("ends", { date: format.dateTime(new Date(`${r.end}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric" }) })}</span>}
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
