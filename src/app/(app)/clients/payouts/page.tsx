import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { payoutRows } from "@/lib/payouts";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Payout export" };
export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level === "leader" || viewer.finance)) notFound();
  const t = await getTranslations("clients");
  const sp = await searchParams;
  const now = new Date(Date.now() + 8 * 3600_000);
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : last;
  const rows = await payoutRows(month);
  const bd = viewer.level === "leader"; // the BD share is visible only to the BD person and Leaders
  const peso = (n: number | null) => (n == null ? "—" : `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return (
    <>
      <Link href="/clients" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("payouts")}</h1>
      <p className="max-w-[760px] text-sm text-muted">{t("payoutHelp")}</p>
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">{t("month")}<input type="month" name="month" defaultValue={month} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm" /></label>
        <button className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">OK</button>
        <a href={`/api/export/payouts?month=${month}`} className="inline-flex h-10 items-center rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("export")}</a>
      </form>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="p-3">Client</th><th className="p-3">BD</th><th className="p-3">Kiosks</th><th className="p-3">Rentals</th><th className="p-3">Sales</th><th className="p-3">{t("kind.venue_share")}</th><th className="p-3">Due</th>{bd && <><th className="p-3">{t("kind.bd_share")}</th><th className="p-3">Due</th></>}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.client} className="border-t border-line"><td className="p-3 font-semibold">{r.client}</td><td className="p-3">{r.owner}</td><td className="p-3">{r.kiosks}</td><td className="p-3">{r.rentals}</td><td className="p-3">{peso(r.sales)}</td><td className="p-3">{r.venueRate}</td><td className="p-3">{peso(r.venueDue)}</td>{bd && <><td className="p-3">{r.bdRate}</td><td className="p-3">{peso(r.bdDue)}</td></>}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
