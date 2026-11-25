import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { decideRefund, markPaid } from "../actions";

export const metadata = { title: "Refund requests" };
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";
const btn = "h-10 rounded-[10px] px-4 text-sm font-semibold";

/** Finance: view, approve and mark paid (spec 4.9). */
export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const supabase = await createClient();
  const { data: lead } = await supabase.rpc("is_cs_lead");
  if (!(viewer.finance || lead || viewer.level === "leader")) notFound();
  const t = await getTranslations("cs");
  const format = await getFormatter();
  const sp = await searchParams;
  const { data } = await supabase.from("cs_refund_requests").select("id, case_id, amount, payment_method, order_no, status, reference_no, created_at, requested_by, case:cs_cases!cs_refund_requests_case_id_fkey(ref)").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as unknown as { id: string; case_id: string; amount: number; payment_method: string; order_no: string | null; status: string; reference_no: string | null; created_at: string; requested_by: string; case: { ref: number } | null }[];
  const canAct = viewer.finance || viewer.level === "leader";
  return (
    <>
      <Link href="/cs" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("refunds")}</h1>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <span className="text-sm"><b>#{r.case?.ref}</b> · ₱{r.amount} · {r.payment_method} · {r.order_no ?? "—"} · <span className="text-muted">{format.dateTime(new Date(r.created_at), { day: "numeric", month: "short" })}</span> · <b>{r.status}</b>{r.reference_no ? ` · ${r.reference_no}` : ""}</span>
              {canAct && r.requested_by !== viewer.id && r.status === "requested" && (
                <form action={decideRefund} className="flex gap-2"><input type="hidden" name="id" value={r.id} />
                  <button name="decision" value="approve" className={`${btn} bg-charge font-bold text-forest`}>{t("approve")}</button>
                  <button name="decision" value="reject" className={`${btn} border border-[#FCA5A5] bg-white text-danger`}>{t("reject")}</button></form>
              )}
              {canAct && r.requested_by !== viewer.id && r.status === "approved" && (
                <form action={markPaid} className="flex gap-2"><input type="hidden" name="id" value={r.id} />
                  <input name="reference" required minLength={3} aria-label={t("reference")} placeholder={t("reference")} className={field} />
                  <button className={`${btn} bg-charge font-bold text-forest`}>{t("paid")}</button></form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
