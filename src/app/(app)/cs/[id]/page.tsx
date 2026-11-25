import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { BusinessPill } from "@/components/BusinessPill";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { TimerPill } from "@/components/TimerPill";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { addMessage, requestRefund, sendToOps, setCaseStatus, setRating } from "../actions";
import { QuickReplyBox } from "./QuickReplyBox";

export const metadata = { title: "Case" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";
const btn = "h-10 rounded-[10px] px-4 text-sm font-semibold";
const KIND_CLS: Record<string, string> = { customer: "bg-[#E0E7FF]", reply: "bg-charge-soft", action: "bg-company-soft", handoff: "bg-[#FEF3C7]", system: "bg-company-soft", note: "bg-white border border-line" };

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("cs");
  const format = await getFormatter();
  const when = (d: string) => format.dateTime(new Date(d), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const supabase = await createClient();
  const { data: c } = await supabase.from("cs_cases_v").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) notFound();
  const [{ data: ty }, { data: events }, { data: canWork }, { data: replies }, { data: refunds }, { data: issue }, people] = await Promise.all([
    supabase.from("cs_case_types").select("*").eq("code", c.type_code).single(),
    supabase.from("cs_case_events").select("id, at, kind, text, actor_id").eq("case_id", id).order("at"),
    supabase.rpc("can_work_case", { p_case: id }),
    supabase.from("cs_quick_replies").select("id, title, text, language").eq("active", true).order("language"),
    supabase.from("cs_refund_requests").select("id, amount, payment_method, status, reference_no, created_at").eq("case_id", id).order("created_at"),
    c.issue_id ? supabase.from("issues").select("id, ref, title, status").eq("id", c.issue_id).maybeSingle() : Promise.resolve({ data: null }),
    getPeople(),
  ]);
  const name = (pid: string | null) => people.find((p) => p.id === pid)?.name ?? "—";
  const replyDue = new Date(new Date(c.created_at).getTime() + (c.channel === "email" ? 240 : 15) * 60000).toISOString();
  const fixDue = new Date(new Date(c.created_at).getTime() + (ty?.fix_minutes ?? 1440) * 60000).toISOString();
  const statusBtn = (status: string, text: string, primary = false) => (
    <form action={setCaseStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} />
      <button className={`${btn} ${primary ? "bg-charge font-bold text-forest" : "border border-field bg-white"}`}>{text}</button></form>
  );
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/cs" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
        <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{t("ref", { ref: c.ref })} · {viewer.language === "zh-Hans" ? ty?.name_zh : ty?.name_en}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessPill business={c.business} />
          <Pill tone={c.status === "solved" ? "ok" : c.status === "open" ? "new" : "wait"}>{t(`status.${c.status}`)}</Pill>
          {c.status !== "solved" && !c.first_reply_at && <TimerPill label={t("replyTimer")} start={c.created_at} due={replyDue} />}
          <TimerPill label={t("fixTimer")} start={c.created_at} due={fixDue} stopped={c.solved_at} />
        </div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
          <section className={card} aria-label={t("trail")}>
            <h2 className="text-base font-bold">{t("trail")}</h2>
            <ol className="flex flex-col gap-2">
              {(events ?? []).map((e) => (
                <li key={e.id} className={`rounded-xl px-3 py-2 text-sm ${KIND_CLS[e.kind] ?? ""}`}>
                  <span className="text-xs text-muted">{when(e.at)} · {t(`kind.${e.kind}`)}{e.actor_id ? ` · ${name(e.actor_id)}` : ""}</span>
                  <p className="whitespace-pre-wrap">{e.text}</p>
                </li>
              ))}
            </ol>
            <form action={addMessage} className="flex flex-col gap-2 border-t border-line pt-3">
              <input type="hidden" name="id" value={id} />
              {canWork ? <QuickReplyBox replies={replies ?? []} placeholder={t("reply")} quickLabel={t("quick")} />
                : <textarea name="text" required rows={2} aria-label={t("addNote")} className="rounded-[10px] border border-field px-3 py-2 text-sm" />}
              <div className="flex flex-wrap gap-2">
                {canWork && <button name="kind" value="reply" className={`${btn} bg-charge font-bold text-forest`}>{t("sendReply")}</button>}
                {canWork && <button name="kind" value="customer" className={`${btn} border border-field bg-white`}>{t("addCustomer")}</button>}
                <button name="kind" value="note" className={`${btn} border border-field bg-white`}>{t("addNote")}</button>
              </div>
            </form>
          </section>
          {canWork && (
            <section className={card}>
              <div className="flex flex-wrap gap-2">
                {c.status === "open" && statusBtn("waiting_customer", t("waiting"))}
                {["waiting_customer", "waiting_finance", "sent_to_ops"].includes(c.status) && statusBtn("open", t("backOpen"))}
                {c.status !== "solved" && statusBtn("solved", t("solve"), true)}
                {c.status === "solved" && statusBtn("open", t("reopen"))}
              </div>
              {c.status !== "solved" && (
                <div className="flex flex-wrap items-start gap-2">
                  <details><summary className={`${btn} inline-flex cursor-pointer list-none items-center border border-field bg-white`}>{t("refund")}</summary>
                    <form action={requestRefund} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={id} />
                      <label className="flex flex-col gap-1 text-xs font-semibold">{t("f.amount")}<input name="amount" type="number" min="1" step="0.01" required defaultValue={c.amount ?? ""} className={field} /></label>
                      <label className="flex flex-col gap-1 text-xs font-semibold">{t("method")}<input name="method" required placeholder="GCash / Maya / card" className={field} /></label>
                      <button className={`${btn} bg-charge font-bold text-forest`}>{t("requestRefund")}</button></form></details>
                  {!c.issue_id && <form action={sendToOps}><input type="hidden" name="id" value={id} /><button className={`${btn} border border-field bg-white`}>{t("ops")}</button></form>}
                </div>
              )}
              {c.status === "solved" && (
                <form action={setRating} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={id} />
                  <label className="flex flex-col gap-1 text-xs font-semibold">{t("rating")}<select name="rating" defaultValue={c.rating ?? 5} className={field}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                  <button className={`${btn} border border-field bg-white`}>{t("saveRating")}</button></form>
              )}
              <p className="text-xs text-muted">{t("smsNote")}</p>
            </section>
          )}
        </div>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          <section className={card} aria-label={t("customerBox")}>
            <h2 className="text-base font-bold">{t("customerBox")}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">{t("f.customer")}</dt><dd className="font-semibold">{c.customer_name ?? "—"}</dd>
              <dt className="text-muted">{t("f.mobile")}</dt><dd>{c.customer_mobile ?? "—"}</dd>
              <dt className="text-muted">{t("f.order")}</dt><dd>{c.order_no ?? "—"}</dd>
              <dt className="text-muted">{t("f.kiosk")}</dt><dd>{c.kiosk_id ?? "—"}{c.location ? ` · ${c.location}` : ""}</dd>
              <dt className="text-muted">{t("f.amount")}</dt><dd>{c.amount != null ? `₱${c.amount}` : "—"}</dd>
              <dt className="text-muted">{t("f.channel")}</dt><dd>{t(`channel.${c.channel}`)}</dd>
              <dt className="text-muted">{t("f.owner")}</dt><dd>{name(c.owner_id)}</dd>
              {c.rating != null && <><dt className="text-muted">{t("rating")}</dt><dd>{c.rating}/5</dd></>}
            </dl>
          </section>
          {issue && <section className={card}><h2 className="text-base font-bold">{t("issue")}</h2><Link href={`/issues/${issue.id}`} className="text-sm font-semibold text-leaf">ISS-{issue.ref} {issue.title}</Link><span className="text-xs text-muted">{issue.status}</span></section>}
          {(refunds ?? []).length > 0 && (
            <section className={card}><h2 className="text-base font-bold">{t("refunds")}</h2>
              <ul className="flex flex-col gap-1 text-sm">{(refunds ?? []).map((r) => <li key={r.id}>₱{r.amount} · {r.payment_method} · <b>{r.status}</b>{r.reference_no ? ` · ${r.reference_no}` : ""}</li>)}</ul></section>
          )}
        </aside>
      </div>
    </>
  );
}
