import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveMetrics, uploadMetrics } from "../actions";

export const metadata = { title: "Business figures" };
const METRICS = ["kiosk_locations", "rentals_per_day", "rental_sales_per_day", "repeat_customer_rate", "slots_sold", "proposals_waiting", "ad_sales_month"];

/** Monthly entry or Excel/CSV upload by Finance or Ops (spec 4.1). No live Besitter connection in version 1. */
export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level === "leader" || viewer.finance || viewer.headOf.includes("ops"))) notFound();
  const t = await getTranslations("dash");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
  const { data } = await (await createClient()).from("business_metrics").select("metric, value").eq("month", `${month}-01`);
  const val = (m: string) => data?.find((x) => x.metric === m)?.value ?? "";
  return (
    <>
      <Link href="/dashboard" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("metricsTitle")}</h1>
      <Flash ok={sp.ok ? t("save") + " ✓" : null} error={sp.error} />
      <form className="flex items-end gap-2"><label className="flex flex-col gap-1 text-xs font-semibold">Month<input type="month" name="month" defaultValue={month} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm" /></label><button className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">OK</button></form>
      <form action={saveMetrics} className="grid max-w-[640px] grid-cols-1 gap-2.5 rounded-[14px] border border-line bg-white p-5 sm:grid-cols-2">
        <input type="hidden" name="month" value={month} />
        {METRICS.map((m) => <label key={m} className="flex flex-col gap-1 text-xs font-semibold">{t(`metric.${m}`)}<input name={m} type="number" step="0.01" defaultValue={val(m)} className="h-10 rounded-[10px] border border-field px-3 text-sm" /></label>)}
        <button className="h-10 w-fit rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("save")}</button>
      </form>
      <form action={uploadMetrics} className="flex max-w-[640px] flex-col gap-2 rounded-[14px] border border-line bg-white p-5">
        <span className="text-sm text-muted">{t("uploadCsv")}</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <button className="h-10 w-fit rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("upload")}</button>
      </form>
    </>
  );
}
