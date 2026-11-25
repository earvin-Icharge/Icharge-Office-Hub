import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { uploadUsage } from "../actions";

export const metadata = { title: "Kiosk usage" };
export default async function UsagePage({ searchParams }: { searchParams: Promise<{ n?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level === "leader" || viewer.finance || viewer.headOf.includes("ops"))) notFound();
  const t = await getTranslations("clients");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("kiosk_usage_monthly").select("month, rentals, sales").order("month", { ascending: false }).limit(5000);
  const months = new Map<string, { kiosks: number; rentals: number; sales: number }>();
  for (const r of data ?? []) { const m = months.get(r.month) ?? { kiosks: 0, rentals: 0, sales: 0 }; m.kiosks++; m.rentals += r.rentals; m.sales += Number(r.sales); months.set(r.month, m); }
  return (
    <>
      <Link href="/clients" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("usage")}</h1>
      <Flash ok={sp.n ? t("uploaded", { n: Number(sp.n) }) : null} error={sp.error} />
      <form action={uploadUsage} className="flex max-w-[640px] flex-col gap-3 rounded-[14px] border border-line bg-white p-5">
        <p className="text-sm text-muted">{t("usageHelp")}</p>
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("upload")}</button>
      </form>
      <section className="max-w-[640px] rounded-[14px] border border-line bg-white p-5">
        <h2 className="mb-2 text-base font-bold">{t("latest")}</h2>
        <table className="w-full text-sm"><tbody>{[...months].slice(0, 12).map(([m, x]) => <tr key={m} className="border-t border-line"><td className="py-1.5">{m.slice(0, 7)}</td><td className="text-right">{x.kiosks} kiosks</td><td className="text-right">{x.rentals} rentals</td><td className="text-right">₱{x.sales.toLocaleString()}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}
